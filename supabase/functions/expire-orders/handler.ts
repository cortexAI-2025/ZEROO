import { HttpError, handle, json, requireEnv } from '../_shared/http.ts';
import { adminClient, unwrap } from '../_shared/supabase.ts';

/**
 * Appelée chaque minute par pg_cron : expire les commandes sans réponse du commerçant
 * (ORDER_ACCEPT_TIMEOUT_MINUTES, 10 par défaut) et efface les adresses de livraison des
 * commandes terminées depuis 7 jours (RGPD). Rien n'est payé avant l'acceptation : il n'y a
 * aucun paiement à libérer.
 */
export const handler = handle(async (req) => {
  if (req.headers.get('x-cron-secret') !== requireEnv('CRON_SECRET'))
    throw new HttpError(401, 'unauthorized');

  const db = adminClient();
  const expired = unwrap(
    await db.rpc('expire_stale_orders', {
      p_placed_minutes: Number(Deno.env.get('ORDER_ACCEPT_TIMEOUT_MINUTES') ?? 10),
      p_pending_minutes: 35,
    }),
  ) as { order_id: string }[];
  const purged = unwrap(await db.rpc('purge_delivery_details', { p_days: 7 })) as number;
  return json({ expired: expired.length, purged });
});
