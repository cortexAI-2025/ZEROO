import { HttpError, handle, json, readJson, requireEnv } from '../_shared/http.ts';
import { appWebUrl, stripeClient } from '../_shared/stripe.ts';
import { adminClient, requireProfessional, requireUser, unwrap } from '../_shared/supabase.ts';

const TRIAL_DAYS = 30;

/**
 * Prix TTC (30 € dont TVA 20 %). STRIPE_TAX_RATE_ID : taux « TVA 20 % » inclus dans le
 * prix, appliqué à l'abonnement pour que les factures détaillent HT / TVA / TTC.
 */
const taxRateId = () => Deno.env.get('STRIPE_TAX_RATE_ID');

/**
 * Abonnement d'un restaurant ou d'un livreur (même offre : 30 € TTC par mois, prix
 * STRIPE_SUBSCRIPTION_PRICE_ID). role « courier » pour un livreur, restaurant par défaut.
 *   action « checkout » : page Stripe Checkout, 30 jours d'essai la première fois ;
 *   action « portal »   : portail client Stripe (carte, factures, résiliation).
 * Ouverte depuis la version web de l'espace professionnel (règles des stores, voir docs).
 */
export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const { action, role } = await readJson<{
    action: 'checkout' | 'portal';
    role?: 'merchant' | 'courier';
  }>(req);
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

  if (subscription && ['trialing', 'active'].includes(subscription.status)) {
    throw new HttpError(409, 'already_subscribed');
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
    line_items: [{ price: requireEnv('STRIPE_SUBSCRIPTION_PRICE_ID'), quantity: 1 }],
    subscription_data: {
      ...(subscription.trial_used ? {} : { trial_period_days: TRIAL_DAYS }),
      ...(taxRateId() ? { default_tax_rates: [taxRateId()!] } : {}),
      metadata,
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
