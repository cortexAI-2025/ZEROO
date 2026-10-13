import { HttpError, handle, json, readJson } from '../_shared/http.ts';
import { fetchOrder } from '../_shared/orders.ts';
import { adminClient, requireUser, unwrap } from '../_shared/supabase.ts';

type Body = {
  orderId: string;
  decision: 'accept' | 'refuse';
  prepMinutes?: number;
  reason?: string;
};

/**
 * Réponse du commerçant à une nouvelle commande : « accepted » (le client peut alors payer
 * le repas via le lien du restaurant ; pour une livraison, la course est proposée aux
 * livreurs) ou « refused ». Rien n'a été payé avant l'acceptation : rien à rembourser.
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

  if (body.decision === 'refuse') {
    unwrap(await transition('refused', { p_refusal_reason: body.reason ?? null }));
    return json({ orderId: order.id, status: 'refused' });
  }

  const prepMinutes = Number(body.prepMinutes);
  if (!Number.isInteger(prepMinutes) || prepMinutes < 1 || prepMinutes > 180) {
    throw new HttpError(400, 'prep_minutes_required');
  }
  unwrap(await transition('accepted', { p_prep_minutes: prepMinutes }));
  return json({ orderId: order.id, status: 'accepted' });
});
