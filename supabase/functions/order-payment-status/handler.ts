import { HttpError, handle, json, readJson } from '../_shared/http.ts';
import { fetchOrder } from '../_shared/orders.ts';
import { stripeClient } from '../_shared/stripe.ts';
import { adminClient, requireUser } from '../_shared/supabase.ts';

/**
 * Appelée par l'app juste après une feuille de paiement : vérifie chez Stripe le repas
 * (autorisation) ou la course (paiement) sans attendre le webhook. Les deux chemins sont
 * idempotents.
 */
export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const { orderId } = await readJson<{ orderId: string }>(req);
  const db = adminClient();
  const order = orderId ? await fetchOrder(db, orderId) : null;
  if (!order || order.customer_id !== user.id) throw new HttpError(404, 'order_not_found');

  if (order.status === 'pending_payment') {
    const stripe = stripeClient();
    if (order.stripe_payment_intent_id && order.stripe_account_id) {
      const intent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, undefined, {
        stripeAccount: order.stripe_account_id,
      });
      if (intent.status === 'requires_capture') {
        await db.rpc('mark_order_authorized', {
          p_order_id: order.id,
          p_payment_intent_id: intent.id,
        });
      } else if (intent.status === 'canceled') {
        await db.rpc('mark_order_payment_failed', { p_order_id: order.id });
      }
    }
  }

  // Course réglée par carte après l'acceptation d'un livreur.
  if (
    order.delivery_payment_intent_id &&
    order.courier_stripe_account_id &&
    order.delivery_payment_method === 'card'
  ) {
    const intent = await stripeClient().paymentIntents.retrieve(
      order.delivery_payment_intent_id,
      undefined,
      { stripeAccount: order.courier_stripe_account_id },
    );
    if (intent.status === 'succeeded') {
      await db.rpc('mark_delivery_authorized', {
        p_order_id: order.id,
        p_payment_intent_id: intent.id,
      });
    }
  }

  const updated = await fetchOrder(db, order.id);
  return json({ orderId: order.id, status: updated?.status });
});
