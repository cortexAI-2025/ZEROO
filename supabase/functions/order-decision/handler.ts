import { HttpError, handle, json, readJson } from '../_shared/http.ts';
import {
  deliveryPayment,
  fetchOrder,
  mealPayment,
  releaseOrderPayments,
  releasePayment,
} from '../_shared/orders.ts';
import { type Stripe, stripeClient } from '../_shared/stripe.ts';
import { adminClient, requireUser, unwrap } from '../_shared/supabase.ts';

type Body = {
  orderId: string;
  decision: 'accept' | 'refuse';
  prepMinutes?: number;
  reason?: string;
};

/**
 * Réponse du commerçant à une nouvelle commande.
 *   accepter : capture des paiements (repas, et course pour une livraison), puis « accepted » ;
 *   refuser  : annulation des autorisations (aucun débit, aucun frais), puis « refused ».
 * Une livraison ne peut être acceptée qu'une fois la course confirmée par le livreur.
 */
export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const body = await readJson<Body>(req);
  if (!body?.orderId || !['accept', 'refuse'].includes(body.decision))
    throw new HttpError(400, 'invalid_body');

  const db = adminClient();
  const order = await fetchOrder(db, body.orderId);
  const owner = order
    ? unwrap(await db.from('merchants').select('owner_id').eq('id', order.merchant_id).single())
    : null;
  if (!order || (owner as { owner_id: string } | null)?.owner_id !== user.id) {
    throw new HttpError(404, 'order_not_found');
  }
  if (order.status !== 'placed') throw new HttpError(409, 'invalid_transition');

  const transition = (status: string, extra: Record<string, unknown> = {}) =>
    db.rpc('apply_order_transition', {
      p_order_id: order.id,
      p_actor: user.id,
      p_status: status,
      ...extra,
    });

  const stripe = stripeClient();

  if (body.decision === 'refuse') {
    await releaseOrderPayments(stripe, order);
    unwrap(await transition('refused', { p_refusal_reason: body.reason ?? null }));
    return json({ orderId: order.id, status: 'refused' });
  }

  const prepMinutes = Number(body.prepMinutes);
  if (!Number.isInteger(prepMinutes) || prepMinutes < 1 || prepMinutes > 180) {
    throw new HttpError(400, 'prep_minutes_required');
  }
  if (order.fulfillment === 'delivery' && !order.courier_accepted_at) {
    throw new HttpError(409, 'courier_not_confirmed');
  }

  // Repas d'abord ; si la course ne peut pas être encaissée, le repas est remboursé.
  const meal = mealPayment(order);
  const course = deliveryPayment(order);
  if (!(await capture(stripe, meal, `capture-${order.id}`))) {
    await releasePayment(stripe, course);
    unwrap(await transition('refused', { p_refusal_reason: 'Paiement non abouti' }));
    throw new HttpError(402, 'payment_capture_failed');
  }
  if (
    order.fulfillment === 'delivery' &&
    !(await capture(stripe, course, `capture-delivery-${order.id}`))
  ) {
    await refund(stripe, meal, `refund-${order.id}`);
    unwrap(
      await transition('refused', { p_refusal_reason: 'Paiement de la livraison non abouti' }),
    );
    throw new HttpError(402, 'payment_capture_failed');
  }

  const { error } = await transition('accepted', { p_prep_minutes: prepMinutes });
  if (error) {
    // Course rare (annulation ou expiration simultanée) : on rembourse ce qui vient d'être capturé.
    await refund(stripe, meal, `refund-${order.id}`);
    await refund(stripe, course, `refund-delivery-${order.id}`);
    throw new Error(error.message);
  }
  return json({ orderId: order.id, status: 'accepted' });
});

type Payment = ReturnType<typeof mealPayment>;

/** Capture une autorisation ; sans paiement (menu offert), rien à capturer. */
async function capture(stripe: Stripe, payment: Payment, idempotencyKey: string) {
  if (!payment.paymentIntentId || !payment.account) return true;
  try {
    await stripe.paymentIntents.capture(payment.paymentIntentId, undefined, {
      stripeAccount: payment.account,
      idempotencyKey,
    });
    return true;
  } catch (error) {
    console.warn('Capture impossible', (error as Error).message);
    return false;
  }
}

async function refund(stripe: Stripe, payment: Payment, idempotencyKey: string) {
  if (!payment.paymentIntentId || !payment.account) return;
  await stripe.refunds.create(
    { payment_intent: payment.paymentIntentId },
    { stripeAccount: payment.account, idempotencyKey },
  );
}
