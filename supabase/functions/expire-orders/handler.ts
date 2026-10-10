import { HttpError, handle, json, requireEnv } from '../_shared/http.ts';
import { releaseOrderPayments } from '../_shared/orders.ts';
import { stripeClient } from '../_shared/stripe.ts';
import { adminClient, unwrap } from '../_shared/supabase.ts';

/**
 * Appelée chaque minute par pg_cron : expire les commandes sans réponse du commerçant
 * (ORDER_ACCEPT_TIMEOUT_MINUTES, 10 par défaut) et celles dont le paiement n'a jamais
 * abouti, puis libère les autorisations chez Stripe (repas et course). Efface aussi les
 * adresses de livraison des commandes terminées depuis 7 jours (RGPD).
 */
export const handler = handle(async (req) => {
  if (req.headers.get('x-cron-secret') !== requireEnv('CRON_SECRET'))
    throw new HttpError(401, 'unauthorized');

  const db = adminClient();
  const expired = unwrap(
    await db.rpc('expire_stale_orders', {
      p_placed_minutes: Number(Deno.env.get('ORDER_ACCEPT_TIMEOUT_MINUTES') ?? 10),
      p_pending_minutes: 35, // la page Stripe Checkout expire au bout de 31 min
    }),
  ) as {
    order_id: string;
    stripe_account_id: string | null;
    stripe_payment_intent_id: string | null;
    stripe_checkout_session_id: string | null;
    courier_stripe_account_id: string | null;
    delivery_payment_intent_id: string | null;
    delivery_checkout_session_id: string | null;
  }[];

  const stripe = stripeClient();
  for (const order of expired) await releaseOrderPayments(stripe, order);
  const purged = unwrap(await db.rpc('purge_delivery_details', { p_days: 7 })) as number;
  return json({ expired: expired.length, purged });
});
