import { HttpError, handle, json, readJson, requireEnv } from '../_shared/http.ts';
import { appWebUrl, stripeClient } from '../_shared/stripe.ts';
import { adminClient, requireProfessional, requireUser, unwrap } from '../_shared/supabase.ts';

const TRIAL_DAYS = 30;

/**
 * Prix HT : la TVA 20 % s'ajoute (taux STRIPE_TAX_RATE_ID, « TVA 20 % » exclusive,
 * appliqué à l'abonnement pour que les factures détaillent HT / TVA / TTC).
 */
const taxRateId = () => Deno.env.get('STRIPE_TAX_RATE_ID');

type Plan = 'start' | 'pro';
type Interval = 'month' | 'year';
const PLANS: Plan[] = ['start', 'pro'];
const INTERVALS: Interval[] = ['month', 'year'];

/**
 * Prix Stripe de la formule choisie (variables d'environnement, voir .env.example) :
 *   restaurant : STRIPE_PRICE_START_MONTH / _YEAR, STRIPE_PRICE_PRO_MONTH / _YEAR
 *   livreur    : STRIPE_PRICE_COURIER_START_MONTH / _YEAR, STRIPE_PRICE_COURIER_PRO_MONTH / _YEAR
 * Anciens noms acceptés : STRIPE_PRICE_COURIER_MONTH / _YEAR (livreur Start) et
 * STRIPE_SUBSCRIPTION_PRICE_ID (Start mensuel, Livreur Start mensuel).
 * Aucun prix n'est créé par le code : ils existent déjà dans Stripe.
 */
export function priceEnvNames(role: 'merchant' | 'courier', plan: Plan, interval: Interval): string[] {
  const i = interval.toUpperCase();
  if (role === 'merchant') return [`STRIPE_PRICE_${plan.toUpperCase()}_${i}`];
  return plan === 'pro'
    ? [`STRIPE_PRICE_COURIER_PRO_${i}`]
    : [`STRIPE_PRICE_COURIER_START_${i}`, `STRIPE_PRICE_COURIER_${i}`];
}

function priceIdFor(role: 'merchant' | 'courier', plan: Plan, interval: Interval) {
  const names = priceEnvNames(role, plan, interval);
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  if (plan === 'start' && interval === 'month') {
    const legacy = Deno.env.get('STRIPE_SUBSCRIPTION_PRICE_ID');
    if (legacy) return legacy;
  }
  return requireEnv(names[0]);
}

/** Abonnement Stripe encore vivant : à ne jamais doubler (impayé, en attente de paiement, en essai…). */
const LIVE_STATUSES = ['trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused'];

/**
 * Abonnement d'un restaurant (formule Start ou Pro) ou d'un livreur (formule unique), au mois
 * ou à l'année. role « courier » pour un livreur, restaurant par défaut.
 *   action « checkout » : page Stripe Checkout, 30 jours d'essai la première fois ;
 *                         plan « start » (défaut) ou « pro », interval « month » (défaut) ou « year » ;
 *   action « portal »   : portail client Stripe (carte, factures, résiliation).
 * Ouverte depuis la version web de l'espace professionnel (règles des stores, voir docs).
 */
export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const body = await readJson<{
    action: 'checkout' | 'portal' | 'change';
    role?: 'merchant' | 'courier';
    plan?: Plan;
    interval?: Interval;
  }>(req);
  const { action, role } = body;
  const plan = body.plan ?? 'start';
  const interval = body.interval ?? 'month';
  if (!PLANS.includes(plan) || !INTERVALS.includes(interval)) {
    throw new HttpError(400, 'invalid_plan');
  }
  const db = adminClient();
  const pro = await requireProfessional(db, user.id, role);
  const stripe = stripeClient();
  const metadata = { [pro.key]: pro.id };
  const backUrl = `${appWebUrl()}${pro.role === 'merchant' ? '/pro/shop' : pro.appPath}`;

  let subscription = unwrap(
    await db.from(pro.subscriptionTable).select('*').eq(pro.key, pro.id).maybeSingle(),
  ) as { stripe_customer_id: string; status: string; trial_used: boolean } | null;

  if (action === 'portal') {
    if (!subscription) throw new HttpError(404, 'no_subscription');
    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: backUrl,
      locale: 'fr',
    });
    return json({ url: portal.url });
  }

  if (action === 'change') {
    // Changement de formule ou de périodicité : l'abonnement existant est modifié (jamais un second).
    if (!subscription || !['trialing', 'active'].includes(subscription.status)) {
      throw new HttpError(409, 'no_active_subscription');
    }
    const row = unwrap(
      await db.from(pro.subscriptionTable).select('stripe_subscription_id').eq(pro.key, pro.id).single(),
    ) as { stripe_subscription_id: string | null };
    if (!row.stripe_subscription_id) throw new HttpError(409, 'no_active_subscription');
    const current = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    const item = current.items.data[0];
    const target = priceIdFor(pro.role, plan, interval);
    if (!item || item.price.id === target) throw new HttpError(409, 'plan_unchanged');
    await stripe.subscriptions.update(current.id, {
      items: [{ id: item.id, price: target }],
      proration_behavior: 'create_prorations',
      cancel_at_period_end: false,
      metadata: { ...metadata, plan, interval },
    });
    // Le webhook (customer.subscription.updated) met la formule à jour dans la base.
    return json({ ok: true });
  }

  if (subscription && ['trialing', 'active'].includes(subscription.status)) {
    throw new HttpError(409, 'already_subscribed');
  }
  // Garde-fou contre le double abonnement : on interroge aussi Stripe (le webhook peut avoir du retard)
  // et on renvoie vers le portail si un abonnement non résilié existe déjà, impayé compris.
  if (subscription) {
    const existing = await stripe.subscriptions.list({
      customer: subscription.stripe_customer_id,
      status: 'all',
      limit: 20,
    });
    if (existing.data.some((s) => LIVE_STATUSES.includes(s.status))) {
      throw new HttpError(409, 'already_subscribed');
    }
  }

  if (!subscription) {
    const customer = await stripe.customers.create(
      { email: user.email, name: pro.name, metadata },
      { idempotencyKey: `customer-${pro.id}` },
    );
    unwrap(
      await db.from(pro.subscriptionTable).insert({
        [pro.key]: pro.id,
        stripe_customer_id: customer.id,
        status: 'incomplete',
      }),
    );
    subscription = { stripe_customer_id: customer.id, status: 'incomplete', trial_used: false };
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    locale: 'fr',
    customer: subscription.stripe_customer_id,
    line_items: [{ price: priceIdFor(pro.role, plan, interval), quantity: 1 }],
    subscription_data: {
      ...(subscription.trial_used ? {} : { trial_period_days: TRIAL_DAYS }),
      ...(taxRateId() ? { default_tax_rates: [taxRateId()!] } : {}),
      metadata: { ...metadata, plan, interval },
    },
    // Facture au nom et à l'adresse du professionnel, avec son numéro de TVA intracommunautaire
    // s'il en a un (pour qu'il puisse déduire la TVA).
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    customer_update: { name: 'auto', address: 'auto' },
    allow_promotion_codes: true,
    metadata,
    success_url: `${appWebUrl()}${pro.appPath}?subscribed=1`,
    cancel_url: backUrl,
  });
  return json({ url: session.url });
});
