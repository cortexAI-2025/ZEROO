import { HttpError, handle, json, readJson } from '../_shared/http.ts';
import { adminClient, requireUser } from '../_shared/supabase.ts';

/**
 * Le livreur renonce à une mission qu'il a acceptée, tant qu'il n'a pas confirmé le paiement
 * de la livraison et que la commande n'est pas partie. La course retourne dans le pool des
 * missions (elle ne lui est plus proposée).
 */
export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const { orderId } = await readJson<{ orderId: string }>(req);
  if (!orderId) throw new HttpError(400, 'invalid_body');
  const db = adminClient();
  const { error } = await db.rpc('courier_release_mission', {
    p_order_id: orderId,
    p_actor: user.id,
  });
  if (error) {
    if (error.message.includes('order_not_found')) throw new HttpError(404, 'order_not_found');
    if (error.message.includes('mission_locked')) throw new HttpError(409, 'mission_locked');
    throw new Error(error.message);
  }
  return json({ orderId, released: true });
});
