import { HttpError, handle, json, readJson } from '../_shared/http.ts';
import { fetchOrder, mealPayment, releaseOrderPayments } from '../_shared/orders.ts';
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
 *   accepter : capture du repas (rien à capturer en espèces), puis « accepted ». Pour une
 *              livraison, la course est ensuite proposée aux livreurs (missions) ;
 *   refuser  : annulation de l'autorisation (aucun débit, aucun frais), puis « refused ».
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

  const meal = mealPayment(order);
  if (!(await capture(stripe, meal, `capture-${order.id}`))) {
    unwrap(await transition('refused', { p_refusal_reason: 'Paiement non abouti' }));
    throw new HttpError(402, 'payment_capture_failed');
  }

  const { error } = await transition('accepted', { p_prep_minutes: prepMinutes });
  if (error) {
    // Cas rare (annulation ou expiration simultanée) : on rembourse ce qui vient d'être capturé.
    await refund(stripe, meal, `refund-${order.id}`);
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
