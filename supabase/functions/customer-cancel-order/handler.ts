import { HttpError, handle, json, readJson } from '../_shared/http.ts';
import { fetchOrder, releaseOrderPayments } from '../_shared/orders.ts';
import { stripeClient } from '../_shared/stripe.ts';
import { adminClient, requireUser, unwrap } from '../_shared/supabase.ts';

/** Le client annule sa commande tant que le commerçant ne l'a pas acceptée : aucun débit (repas ni course). */
export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const { orderId } = await readJson<{ orderId: string }>(req);
  const db = adminClient();
  const order = orderId ? await fetchOrder(db, orderId) : null;
  if (!order || order.customer_id !== user.id) throw new HttpError(404, 'order_not_found');
  if (!['pending_payment', 'placed'].includes(order.status))
    throw new HttpError(409, 'invalid_transition');

  await releaseOrderPayments(stripeClient(), order);
  unwrap(
    await db.rpc('apply_order_transition', {
      p_order_id: order.id,
      p_actor: user.id,
      p_status: 'cancelled',
    }),
  );
  return json({ orderId: order.id, status: 'cancelled' });
});
