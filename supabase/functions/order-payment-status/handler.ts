import { HttpError, handle, json, readJson } from '../_shared/http.ts';
import { fetchOrder } from '../_shared/orders.ts';
import { stripeClient } from '../_shared/stripe.ts';
import { adminClient, requireUser } from '../_shared/supabase.ts';

/**
 * Appelée par l'app juste après les feuilles de paiement : vérifie les autorisations chez
 * Stripe (repas, puis course pour une livraison) sans attendre le webhook. Les deux
 * chemins sont idempotents.
 */
export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const { orderId } = await readJson<{ orderId: string }>(req);
  const db = adminClient();
  const order = orderId ? await fetchOrder(db, orderId) : null;
  if (!order || order.customer_id !== user.id) throw new HttpError(404, 'order_not_found');

  if (order.status === 'pending_payment') {
    const stripe = stripeClient();
    const checks = [
      {
        intentId: order.stripe_payment_intent_id,
        account: order.stripe_account_id,
        authorize: 'mark_order_authorized',
      },
      {
        intentId: order.delivery_payment_intent_id,
        account: order.courier_stripe_account_id,
        authorize: 'mark_delivery_authorized',
      },
    ];
    for (const check of checks) {
      if (!check.intentId || !check.account) continue;
      const intent = await stripe.paymentIntents.retrieve(check.intentId, undefined, {
        stripeAccount: check.account,
      });
      if (intent.status === 'requires_capture') {
        await db.rpc(check.authorize, { p_order_id: order.id, p_payment_intent_id: intent.id });
      } else if (intent.status === 'canceled') {
        await db.rpc('mark_order_payment_failed', { p_order_id: order.id });
      }
    }
  }

  const updated = await fetchOrder(db, order.id);
  return json({ orderId: order.id, status: updated?.status });
});
