import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';

import { HttpError, handle, json, requireEnv } from '../_shared/http.ts';
import { Stripe, stripeClient } from '../_shared/stripe.ts';
import { adminClient, unwrap } from '../_shared/supabase.ts';

const cryptoProvider = Stripe.createSubtleCryptoProvider();

/**
 * Webhook du compte Stripe d'AiWorkPay (STRIPE_WEBHOOK_SECRET) : abonnements des restaurants
 * et des livreurs. Les commandes ne passent pas par Stripe : le client paie chaque professionnel
 * via son propre lien de paiement.
 */
async function verify(stripe: Stripe, payload: string, signature: string): Promise<Stripe.Event> {
  const secrets = [Deno.env.get('STRIPE_WEBHOOK_SECRET')].filter((s): s is string => !!s);
  for (const secret of secrets) {
    try {
      return await stripe.webhooks.constructEventAsync(
        payload,
        signature,
        secret,
        undefined,
        cryptoProvider,
      );
    } catch {
      // essaie le secret suivant
    }
  }
  throw new HttpError(400, 'invalid_signature');
}

/**
 * Formule du restaurant : Pro (retrait + livraison) si le prix souscrit est un prix Pro, sinon
 * Start. Sans identifiants de prix configurés, on se fie à la formule choisie au paiement.
 */
function merchantPlan(subscription: Stripe.Subscription): 'start' | 'pro' {
  const proPrices = [
    Deno.env.get('STRIPE_PRICE_PRO_MONTH'),
    Deno.env.get('STRIPE_PRICE_PRO_YEAR'),
  ].filter((id): id is string => !!id);
  const priceId = subscription.items.data[0]?.price?.id;
  if (proPrices.length > 0) return priceId && proPrices.includes(priceId) ? 'pro' : 'start';
  return subscription.metadata?.plan === 'pro' ? 'pro' : 'start';
}

/** Formule du livreur : Pro (plusieurs courses, nuit) si le prix souscrit est un prix Pro, sinon Start. */
function courierPlan(subscription: Stripe.Subscription): 'start' | 'pro' {
  const proPrices = [
    Deno.env.get('STRIPE_PRICE_COURIER_PRO_MONTH'),
    Deno.env.get('STRIPE_PRICE_COURIER_PRO_YEAR'),
  ].filter((id): id is string => !!id);
  const priceId = subscription.items.data[0]?.price?.id;
  if (proPrices.length > 0) return priceId && proPrices.includes(priceId) ? 'pro' : 'start';
  return subscription.metadata?.plan === 'pro' ? 'pro' : 'start';
}

/** Abonnement d'un restaurant ou d'un livreur (même offre), retrouvé par son client Stripe. */
async function syncSubscription(db: SupabaseClient, subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const periodEnd = subscription.items.data[0]?.current_period_end;
  const toDate = (seconds: number | null | undefined) =>
    seconds ? new Date(seconds * 1000).toISOString() : null;
  for (const table of ['subscriptions', 'courier_subscriptions']) {
    const { data: existing } = await db
      .from(table)
      .select('trial_used')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (!existing) continue;
    unwrap(
      await db
        .from(table)
        .update({
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          trial_end: toDate(subscription.trial_end),
          current_period_end: toDate(periodEnd),
          cancel_at_period_end: subscription.cancel_at_period_end,
          trial_used: existing.trial_used || subscription.trial_end !== null,
          plan: table === 'subscriptions' ? merchantPlan(subscription) : courierPlan(subscription),
        })
        .eq('stripe_customer_id', customerId),
    );
  }
}

/** Seuls les abonnements passent par Stripe : les commandes sont payées directement aux pros. */
async function processEvent(db: SupabaseClient, stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode === 'subscription' && session.subscription) {
        const id =
          typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
        await syncSubscription(db, await stripe.subscriptions.retrieve(id));
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await syncSubscription(db, event.data.object);
      break;
    default:
      // Événement non utilisé : accusé de réception simple.
      break;
  }
}

export const handler = handle(async (req) => {
  requireEnv('STRIPE_SECRET_KEY');
  const signature = req.headers.get('Stripe-Signature');
  if (!signature) throw new HttpError(400, 'invalid_signature');
  const payload = await req.text();
  const stripe = stripeClient();
  const event = await verify(stripe, payload, signature);

  const db = adminClient();
  const { data: seen } = await db
    .from('stripe_events')
    .select('id')
    .eq('id', event.id)
    .maybeSingle();
  if (seen) return json({ received: true, duplicate: true });

  await processEvent(db, stripe, event);
  // Enregistré après traitement : en cas d'erreur, Stripe renverra l'événement.
  await db.from('stripe_events').upsert({ id: event.id, type: event.type });
  return json({ received: true });
});
