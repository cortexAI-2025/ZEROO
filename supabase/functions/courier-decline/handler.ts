import { HttpError, handle, json, readJson } from '../_shared/http.ts';
import { releasePayment } from '../_shared/orders.ts';
import { stripeClient } from '../_shared/stripe.ts';
import { adminClient, requireUser } from '../_shared/supabase.ts';

/**
 * Le livreur renonce à une mission qu'il a acceptée, tant que le client ne l'a pas payée et
 * que la commande n'est pas partie. La course retourne dans le pool des missions (elle ne lui
 * est plus proposée) et un paiement de course éventuellement ouvert est annulé chez Stripe.
 */
export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const { orderId } = await readJson<{ orderId: string }>(req);
  if (!orderId) throw new HttpError(400, 'invalid_body');
  const db = adminClient();
  const { data, error } = await db.rpc('courier_release_mission', {
    p_order_id: orderId,
    p_actor: user.id,
  });
  if (error) {
    if (error.message.includes('order_not_found')) throw new HttpError(404, 'order_not_found');
    if (error.message.includes('mission_locked')) throw new HttpError(409, 'mission_locked');
    throw new Error(error.message);
  }
  const released = (data as { delivery_payment_intent_id: string | null; courier_stripe_account_id: string | null }[])[0];
  if (released) {
    await releasePayment(stripeClient(), {
      account: released.courier_stripe_account_id,
      paymentIntentId: released.delivery_payment_intent_id,
      checkoutSessionId: null,
    });
  }
  return json({ orderId, released: true });
});
