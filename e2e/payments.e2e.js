// Paiements Stripe de bout en bout, côté serveur : Edge Functions + base locale + stripe-mock.
// Prérequis (voir README) : `docker run -p 12111:12111 stripe/stripe-mock`, fonctions servies
// avec STRIPE_API_BASE=http://localhost:12111 et les secrets de supabase/functions/.env.example.
const {
  ANON,
  AUTH_URL,
  connectEvent,
  CONNECT_SECRET,
  FUNCTIONS,
  PLATFORM_SECRET,
  run,
  sql,
  step,
  webhook,
} = require('./helpers');

const CRON_SECRET = process.env.CRON_SECRET ?? 'cron_test';
const SAMIR = '30000000-0000-0000-0000-000000000001';
const KEBAB = '50000000-0000-0000-0000-000000000003';

async function signIn(email) {
  const res = await fetch(`${AUTH_URL}/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'motdepasse1' }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`connexion ${email} : ${JSON.stringify(body)}`);
  return body.access_token;
}

async function call(name, token, body, headers = {}) {
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: ANON,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

function expect(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} : obtenu ${JSON.stringify(actual)}, attendu ${JSON.stringify(expected)}`,
    );
  }
}

const orderRow = (id) =>
  sql(
    `select status || '|' || coalesce(stripe_payment_intent_id, '-') || '|' || (paid_at is not null) from orders where id = '${id}'`,
  );

run('Paiements', async () => {
  // Commerce de démo ouvert 24 h/24 pour que le test passe à toute heure.
  sql(`update merchants set is_paused = false where id = '${SAMIR}'`);
  sql(`delete from merchant_opening_hours where merchant_id = '${SAMIR}'`);
  sql(
    `insert into merchant_opening_hours (merchant_id, weekday, opens_at, closes_at) select '${SAMIR}', d, t.o, t.c from generate_series(1,7) d, (values ('00:00'::time,'12:00'::time),('12:00'::time,'00:00'::time)) t(o,c)`,
  );
  const blanche = sql(
    `select o.id from menu_options o join menu_option_groups g on g.id = o.group_id where g.item_id = '${KEBAB}' and o.name = 'Blanche'`,
  );
  const kebab = [{ itemId: KEBAB, quantity: 2, optionIds: [blanche] }];

  const client = await signIn('client@zeroo.test');
  const merchant = await signIn('commercant@zeroo.test');

  // --- Commande payée dans l'app (PaymentSheet) ------------------------------------
  const created = await call('create-order', client, {
    merchantId: SAMIR,
    items: kebab,
    channel: 'native',
  });
  expect(created.status, 200, 'create-order');
  const [mealPayment] = created.body.payments ?? [];
  if (!mealPayment?.clientSecret) throw new Error('client_secret manquant');
  expect(
    created.body.payments.map((p) => `${p.kind}|${p.stripeAccountId}`),
    ['meal|acct_demo_chez_samir'],
    'retrait : un seul paiement, sur le compte du commerçant',
  );
  const order1 = created.body.orderId;
  const pi1 = sql(`select stripe_payment_intent_id from orders where id = '${order1}'`);
  expect(
    sql(`select status || '|' || total_cents from orders where id = '${order1}'`),
    'pending_payment|1500',
    'commande en attente de paiement',
  );
  step(
    'create-order : commande à 15,00 € et PaymentIntent sur le compte du commerçant (capture manuelle)',
  );

  expect(
    (
      await call('order-decision', merchant, {
        orderId: order1,
        decision: 'accept',
        prepMinutes: 10,
      })
    ).body.error,
    'invalid_transition',
    'acceptation avant paiement',
  );
  step("impossible d'accepter une commande tant que le paiement n'est pas autorisé");

  const bad = await fetch(`${FUNCTIONS}/stripe-webhook`, {
    method: 'POST',
    headers: { 'Stripe-Signature': 't=1,v1=faux' },
    body: '{}',
  });
  expect(bad.status, 400, 'signature invalide');
  // Attaques : un autre commerçant (autre compte Stripe), ou un montant inférieur au total.
  await connectEvent(
    'payment_intent.amount_capturable_updated',
    { id: 'pi_pirate', amount_capturable: 100000, metadata: { order_id: order1 } },
    'acct_pirate',
  );
  await connectEvent('payment_intent.amount_capturable_updated', {
    id: 'pi_pirate',
    amount_capturable: 1,
    metadata: { order_id: order1 },
  });
  expect(orderRow(order1), `pending_payment|${pi1}|false`, 'événements frauduleux ignorés');
  const authorized = await connectEvent('payment_intent.amount_capturable_updated', {
    amount_capturable: 100000,
    id: pi1,
    object: 'payment_intent',
    metadata: { order_id: order1 },
  });
  expect(authorized.status, 200, 'webhook');
  expect(orderRow(order1), `placed|${pi1}|false`, 'commande transmise au commerçant');
  const again = await webhook(
    'payment_intent.amount_capturable_updated',
    { id: pi1, metadata: { order_id: order1 } },
    CONNECT_SECRET,
    authorized.id,
  );
  expect(again.body.duplicate, true, 'événement rejoué');
  step(
    'webhook signé : paiement autorisé → commande chez le commerçant ; signature fausse, autre compte Stripe ou montant insuffisant refusés ; doublon ignoré',
  );

  expect(
    (await call('order-decision', client, { orderId: order1, decision: 'accept', prepMinutes: 10 }))
      .status,
    404,
    'client',
  );
  expect(
    (await call('order-decision', merchant, { orderId: order1, decision: 'accept' })).body.error,
    'prep_minutes_required',
    'délai',
  );
  const accepted = await call('order-decision', merchant, {
    orderId: order1,
    decision: 'accept',
    prepMinutes: 10,
  });
  expect(accepted.body.status, 'accepted', 'acceptation');
  expect(orderRow(order1), `accepted|${pi1}|true`, 'paiement capturé');
  step(
    'le commerçant accepte : paiement capturé (paid_at), le client ne peut pas décider à sa place',
  );

  // --- Refus : l'autorisation est annulée, aucun débit ----------------------------
  const second = await call('create-order', client, {
    merchantId: SAMIR,
    items: kebab,
    channel: 'native',
  });
  const pi2 = sql(
    `select stripe_payment_intent_id from orders where id = '${second.body.orderId}'`,
  );
  await connectEvent('payment_intent.amount_capturable_updated', {
    amount_capturable: 100000,
    id: pi2,
    metadata: { order_id: second.body.orderId },
  });
  const refused = await call('order-decision', merchant, {
    orderId: second.body.orderId,
    decision: 'refuse',
    reason: 'Rupture',
  });
  expect(refused.body.status, 'refused', 'refus');
  expect(orderRow(second.body.orderId), `refused|${pi2}|false`, 'jamais capturé');
  step("le commerçant refuse : autorisation annulée, rien n'est capturé");

  // --- Annulation par le client ----------------------------------------------------
  const third = await call('create-order', client, {
    merchantId: SAMIR,
    items: kebab,
    channel: 'native',
  });
  const pi3 = sql(`select stripe_payment_intent_id from orders where id = '${third.body.orderId}'`);
  await connectEvent('payment_intent.amount_capturable_updated', {
    amount_capturable: 100000,
    id: pi3,
    metadata: { order_id: third.body.orderId },
  });
  expect(
    (await call('customer-cancel-order', merchant, { orderId: third.body.orderId })).status,
    404,
    'annulation par un autre',
  );
  expect(
    (await call('customer-cancel-order', client, { orderId: third.body.orderId })).body.status,
    'cancelled',
    'annulation',
  );
  expect(
    (await call('customer-cancel-order', client, { orderId: third.body.orderId })).status,
    409,
    'double annulation',
  );
  step(
    "le client annule avant acceptation (autorisation libérée) ; personne d'autre ne peut annuler",
  );

  // --- Paiement sur le web (Stripe Checkout) --------------------------------------
  const web = await call('create-order', client, {
    merchantId: SAMIR,
    items: kebab,
    channel: 'web',
  });
  if (!web.body.checkoutUrl) throw new Error('checkoutUrl manquant : ' + JSON.stringify(web.body));
  const session = sql(
    `select stripe_checkout_session_id from orders where id = '${web.body.orderId}'`,
  );
  await connectEvent('checkout.session.expired', {
    id: session,
    mode: 'payment',
    metadata: { order_id: web.body.orderId },
  });
  expect(
    sql(`select status from orders where id = '${web.body.orderId}'`),
    'cancelled',
    'session expirée',
  );
  step('web : page Stripe Checkout créée ; session expirée → commande annulée');

  // --- Garde-fous -------------------------------------------------------------------------
  sql(`update menu_items set price_cents = 30 where name = 'Canette 33 cl'`);
  const tiny = await call('create-order', client, {
    merchantId: SAMIR,
    items: [{ itemId: '50000000-0000-0000-0000-000000000004', quantity: 1 }],
    channel: 'native',
  });
  sql(`update menu_items set price_cents = 150 where name = 'Canette 33 cl'`);
  expect(tiny.body.error, 'amount_too_small', 'minimum Stripe');
  sql(`update subscriptions set status = 'past_due' where merchant_id = '${SAMIR}'`);
  const unpaid = await call('create-order', client, {
    merchantId: SAMIR,
    items: kebab,
    channel: 'native',
  });
  sql(`update subscriptions set status = 'trialing' where merchant_id = '${SAMIR}'`);
  expect(unpaid.body.error, 'merchant_not_accepting', 'abonnement impayé');
  expect(
    (await call('create-order', null, { merchantId: SAMIR, items: kebab, channel: 'native' }))
      .status,
    401,
    'sans compte',
  );
  step('refus : montant < 0,50 €, abonnement impayé, utilisateur non connecté');

  // --- Inscription d'un nouveau commerçant : Stripe Connect puis abonnement ---------------
  const email = `pay${Date.now()}@zeroo.test`;
  await fetch(`${AUTH_URL}/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'motdepasse1' }),
  });
  sql(`update auth.users set email_confirmed_at = now() where email = '${email}'`);
  const owner = await signIn(email);
  const rest = await fetch(`${AUTH_URL.replace('/auth/v1', '/rest/v1')}/rpc/create_merchant`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${owner}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      p_name: 'Snack Paiement',
      p_category: 'snack',
      p_address_line: '1 rue A',
      p_postal_code: '75001',
      p_city: 'Paris',
      p_latitude: 48.86,
      p_longitude: 2.34,
    }),
  });
  const newMerchant = (await rest.json()).id;

  const link = await call('connect-onboarding', owner, { action: 'link' });
  if (!link.body.url) throw new Error('lien Connect manquant : ' + JSON.stringify(link.body));
  const account = sql(
    `select stripe_account_id || '|' || charges_enabled from merchant_stripe_accounts where merchant_id = '${newMerchant}'`,
  );
  const accountId = account.split('|')[0];
  expect(account.split('|')[1], 'false', 'compte pas encore activé');
  await webhook('account.updated', {
    id: accountId,
    object: 'account',
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
  });
  expect(
    sql(
      `select charges_enabled from merchant_stripe_accounts where merchant_id = '${newMerchant}'`,
    ),
    't',
    'compte activé',
  );
  expect(
    (await call('connect-onboarding', client, { action: 'link' })).status,
    404,
    'client sans commerce',
  );
  step(
    "Stripe Connect : compte créé + lien d'inscription ; webhook account.updated → paiements activés",
  );

  const checkout = await call('billing', owner, { action: 'checkout' });
  if (!checkout.body.url)
    throw new Error('Checkout abonnement manquant : ' + JSON.stringify(checkout.body));
  const customer = sql(
    `select stripe_customer_id from subscriptions where merchant_id = '${newMerchant}'`,
  );
  const trialEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
  await webhook(
    'customer.subscription.created',
    {
      id: `sub_test_${Date.now()}`,
      object: 'subscription',
      customer,
      status: 'trialing',
      trial_end: trialEnd,
      cancel_at_period_end: false,
      items: { data: [{ current_period_end: trialEnd }] },
    },
    PLATFORM_SECRET,
  );
  expect(
    sql(
      `select status || '|' || trial_used || '|' || (trial_end is not null) from subscriptions where merchant_id = '${newMerchant}'`,
    ),
    'trialing|true|true',
    'abonnement en essai',
  );
  expect(
    (await call('billing', owner, { action: 'checkout' })).body.error,
    'already_subscribed',
    'déjà abonné',
  );
  if (!(await call('billing', owner, { action: 'portal' })).body.url)
    throw new Error('portail manquant');
  step(
    'abonnement : Checkout (essai 30 jours), webhook → « trialing », portail client ; pas de double abonnement',
  );

  // --- Expiration (pg_cron) ------------------------------------------------------------
  sql(
    `insert into orders (merchant_id, customer_id, status, subtotal_cents, total_cents, placed_at) values ('${SAMIR}', '20000000-0000-0000-0000-000000000001', 'placed', 750, 750, now() - interval '15 minutes')`,
  );
  expect(
    (await call('expire-orders', null, {}, { 'x-cron-secret': 'faux' })).status,
    401,
    'secret cron',
  );
  const expired = await call('expire-orders', null, {}, { 'x-cron-secret': CRON_SECRET });
  if (!(expired.body.expired >= 1)) throw new Error('expiration : ' + JSON.stringify(expired.body));
  step(
    `expire-orders : ${expired.body.expired} commande(s) sans réponse expirée(s), secret obligatoire`,
  );
});
