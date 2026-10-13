import { HttpError, handle, json, readJson } from '../_shared/http.ts';
import { fetchOrder, releaseOrderPayments } from '../_shared/orders.ts';
import { stripeClient } from '../_shared/stripe.ts';
import { adminClient, requireCourier, requireUser, unwrap } from '../_shared/supabase.ts';

/**
 * Le livreur décline la course qui lui a été attribuée, avant que le restaurant ne l'accepte.
 * Les deux autorisations (repas et course) sont libérées : le client n'est pas débité.
 */
export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const { orderId } = await readJson<{ orderId: string }>(req);
  const db = adminClient();
  const courier = await requireCourier(db, user.id);
  const order = orderId ? await fetchOrder(db, orderId) : null;
  if (!order || order.courier_id !== courier.id) throw new HttpError(404, 'order_not_found');
  if (order.status !== 'placed') throw new HttpError(409, 'invalid_transition');

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
