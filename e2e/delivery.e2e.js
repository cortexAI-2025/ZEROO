// Livraison par livreur indépendant, côté serveur : Edge Functions + base locale + stripe-mock,
// avec un faux service Expo Push pour vérifier les notifications du livreur et du client.
//
// Prérequis : ceux de payments.e2e.js et notifications.e2e.js (fonctions servies avec
// EXPO_PUSH_URL=http://<hôte>:54500/push ; E2E_DB_FUNCTIONS_URL vue depuis la base).
const http = require('http');

const {
  ANON,
  AUTH_URL,
  connectEvent,
  FUNCTIONS,
  PLATFORM_SECRET,
  run,
  sql,
  step,
  webhook,
} = require('./helpers');

const DB_FUNCTIONS_URL =
  process.env.E2E_DB_FUNCTIONS_URL ?? 'http://supabase_kong_zeroo:8000/functions/v1';
const CRON_SECRET = process.env.CRON_SECRET ?? 'cron_test';
const SAMIR = '30000000-0000-0000-0000-000000000001';
const KARIM = '80000000-0000-0000-0000-000000000001';
const MENU = '50000000-0000-0000-0000-000000000002'; // Menu Américain 9,50 €, sans option
const ADDRESS = {
  addressLine: '5 rue Saint-Augustin',
  postalCode: '75002',
  city: 'Paris',
  latitude: 48.87,
  longitude: 2.34,
  phone: '06 98 76 54 32',
  instructions: 'Digicode 1234',
};

const pushes = [];
function fakeExpoPush() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const messages = JSON.parse(body || '[]');
      pushes.push(...messages);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: messages.map((_, i) => ({ status: 'ok', id: `t${i}` })) }));
    });
  });
  return new Promise((resolve) => server.listen(54500, '0.0.0.0', () => resolve(server)));
}

async function waitForPush(to, title, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = pushes.find((p) => p.to === to && p.title.startsWith(title));
    if (found) return found;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `notification « ${title} » non reçue par ${to} ; reçues : ${JSON.stringify(pushes.map((p) => [p.to, p.title]))}`,
  );
}

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

async function call(name, token, body) {
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: ANON,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

/** Appel PostgREST (RPC) avec le jeton de l'utilisateur. */
async function rpc(name, token, body) {
  const res = await fetch(`${AUTH_URL.replace('/auth/v1', '/rest/v1')}/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token ?? ANON}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function expect(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} : obtenu ${JSON.stringify(actual)}, attendu ${JSON.stringify(expected)}`,
    );
  }
}

const row = (id, columns) => sql(`select ${columns} from orders where id = '${id}'`);

run('Livraison', async () => {
  const server = await fakeExpoPush();
  try {
    sql(`delete from vault.secrets where name in ('functions_url', 'cron_secret')`);
    sql(`select vault.create_secret('${DB_FUNCTIONS_URL}', 'functions_url')`);
    sql(`select vault.create_secret('${CRON_SECRET}', 'cron_secret')`);
    sql(`update merchants set is_paused = false where id = '${SAMIR}'`);
    sql(`delete from merchant_opening_hours where merchant_id = '${SAMIR}'`);
    sql(
      `insert into merchant_opening_hours (merchant_id, weekday, opens_at, closes_at) select '${SAMIR}', d, t.o, t.c from generate_series(1,7) d, (values ('00:00'::time,'12:00'::time),('12:00'::time,'00:00'::time)) t(o,c)`,
    );
    // Karim libre et disponible, aucune course en cours.
    sql(
      `update orders set status = 'cancelled', cancelled_at = now() where courier_id = '${KARIM}' and status not in ('delivered', 'cancelled', 'refused', 'expired')`,
    );
    sql(`update couriers set is_available = true where id = '${KARIM}'`);
    sql(`delete from push_tokens`);

    const client = await signIn('client@zeroo.test');
    const merchant = await signIn('commercant@zeroo.test');
    const courier = await signIn('livreur@zeroo.test');
    await rpc('register_push_token', client, {
      p_token: 'ExponentPushToken[nadia]',
      p_platform: 'ios',
    });
    await rpc('register_push_token', courier, {
      p_token: 'ExponentPushToken[karim]',
      p_platform: 'android',
    });

    // --- Devis -------------------------------------------------------------------------
    const quote = await rpc('merchant_delivery_quote', null, {
      p_merchant_id: SAMIR,
      p_latitude: ADDRESS.latitude,
      p_longitude: ADDRESS.longitude,
    });
    expect(
      quote.body.map((q) => `${q.available}|${q.fee_cents}`),
      ['true|350'],
      'devis de livraison',
    );
    step('devis : livraison possible à cette adresse, course à 3,50 € fixée par le restaurant');

    // --- Commande livrée payée dans l'app : deux paiements -----------------------------
    const created = await call('create-order', client, {
      merchantId: SAMIR,
      items: [{ itemId: MENU, quantity: 2 }],
      channel: 'native',
      delivery: ADDRESS,
    });
    expect(created.status, 200, 'create-order : ' + JSON.stringify(created.body));
    expect(
      created.body.payments.map((p) => `${p.kind}|${p.stripeAccountId}|${p.amountCents}`),
      ['meal|acct_demo_chez_samir|1900', 'delivery|acct_demo_karim|350'],
      'deux paiements',
    );
    const order = created.body.orderId;
    const mealPi = row(order, 'stripe_payment_intent_id');
    const deliveryPi = row(order, 'delivery_payment_intent_id');
    expect(
      row(order, `status || '|' || courier_name || '|' || fulfillment`),
      'pending_payment|Karim|delivery',
      'commande réservée',
    );
    step(
      'create-order : repas 19 € sur le compte du restaurant, course 3,50 € sur le compte de Karim (capture manuelle)',
    );

    // Un paiement de course venant du compte du restaurant est ignoré.
    await connectEvent('payment_intent.amount_capturable_updated', {
      id: deliveryPi,
      amount_capturable: 350,
      metadata: { order_id: order, kind: 'delivery' },
    });
    await connectEvent(
      'payment_intent.amount_capturable_updated',
      { id: deliveryPi, amount_capturable: 100, metadata: { order_id: order, kind: 'delivery' } },
      'acct_demo_karim',
    );
    expect(row(order, `delivery_authorized_at is null`), 't', 'course frauduleuse ignorée');
    await connectEvent(
      'payment_intent.amount_capturable_updated',
      { id: deliveryPi, amount_capturable: 350, metadata: { order_id: order, kind: 'delivery' } },
      'acct_demo_karim',
    );
    expect(row(order, 'status'), 'pending_payment', 'course seule autorisée');
    await connectEvent('payment_intent.amount_capturable_updated', {
      id: mealPi,
      amount_capturable: 1900,
      metadata: { order_id: order, kind: 'meal' },
    });
    expect(row(order, 'status'), 'placed', 'deux paiements autorisés');
    await waitForPush('ExponentPushToken[karim]', 'Nouvelle course');
    step(
      'webhooks : la commande part quand repas ET course sont autorisés ; mauvais compte ou montant ignorés ; Karim reçoit « Nouvelle course »',
    );

    // --- Confirmation du livreur, acceptation du restaurant ----------------------------
    expect(
      (
        await call('order-decision', merchant, {
          orderId: order,
          decision: 'accept',
          prepMinutes: 10,
        })
      ).body.error,
      'courier_not_confirmed',
      'acceptation avant le livreur',
    );
    expect(
      (await rpc('courier_confirm_order', client, { p_order_id: order })).body.message,
      'order_not_found',
      'seul le livreur de la course la confirme',
    );
    expect(
      (await rpc('courier_confirm_order', courier, { p_order_id: order })).status,
      200,
      'Karim',
    );
    const accepted = await call('order-decision', merchant, {
      orderId: order,
      decision: 'accept',
      prepMinutes: 10,
    });
    expect(accepted.body.status, 'accepted', 'acceptation');
    expect(
      row(order, `(paid_at is not null) || '|' || (delivery_paid_at is not null)`),
      'true|true',
      'repas et course capturés',
    );
    await waitForPush('ExponentPushToken[nadia]', 'Commande acceptée');
    await waitForPush('ExponentPushToken[karim]', 'Course confirmée');
    step(
      'Karim confirme la course, puis le restaurant accepte : repas et course capturés, client et livreur prévenus',
    );

    // --- Remise au livreur, livraison -----------------------------------------------------
    const pickupCode = row(order, 'pickup_code');
    const deliveryCode = row(order, 'delivery_code');
    await rpc('set_order_status', merchant, { p_order_id: order, p_status: 'ready' });
    await waitForPush('ExponentPushToken[karim]', 'Commande prête');
    expect(
      (
        await rpc('set_order_status', merchant, {
          p_order_id: order,
          p_status: 'collected',
          p_pickup_code: pickupCode,
        })
      ).status,
      400,
      'pas de retrait au comptoir pour une livraison',
    );
    expect(
      (
        await rpc('set_order_status', merchant, {
          p_order_id: order,
          p_status: 'out_for_delivery',
          p_pickup_code: pickupCode,
        })
      ).status,
      200,
      'remise au livreur',
    );
    const enRoute = await waitForPush('ExponentPushToken[nadia]', 'En route');
    if (!enRoute.body.includes(deliveryCode))
      throw new Error('code de livraison absent : ' + enRoute.body);
    expect(
      (
        await rpc('courier_mark_delivered', courier, {
          p_order_id: order,
          p_delivery_code: '9999' === deliveryCode ? '0000' : '9999',
        })
      ).status,
      400,
      'code faux',
    );
    expect(
      (
        await rpc('courier_mark_delivered', courier, {
          p_order_id: order,
          p_delivery_code: deliveryCode,
        })
      ).body.status,
      'delivered',
      'livrée',
    );
    await waitForPush('ExponentPushToken[nadia]', 'Commande livrée');
    const earnings = await rpc('courier_earnings_summary', courier, {});
    if (!(earnings.body[0].today_cents >= 350))
      throw new Error('revenus : ' + JSON.stringify(earnings.body));
    step(
      'prête → Karim prévenu ; remise au livreur avec le code de retrait → client « En route » avec son code ; Karim livre avec ce code ; revenus du jour',
    );

    // --- Le livreur décline ----------------------------------------------------------------
    const second = await call('create-order', client, {
      merchantId: SAMIR,
      items: [{ itemId: MENU, quantity: 1 }],
      channel: 'native',
      delivery: ADDRESS,
    });
    const order2 = second.body.orderId;
    sql(
      `select mark_order_authorized('${order2}', 'pi_x'), mark_delivery_authorized('${order2}', 'pi_y')`,
    );
    expect(
      (await call('courier-decline', merchant, { orderId: order2 })).status,
      404,
      'pas livreur',
    );
    expect(
      (await call('courier-decline', courier, { orderId: order2 })).body.status,
      'cancelled',
      'déclinée',
    );
    expect(row(order2, 'cancelled_by'), 'courier', 'annulée par le livreur');
    await waitForPush('ExponentPushToken[nadia]', 'Livraison impossible');
    step(
      'Karim décline : les deux paiements sont libérés, le client est prévenu (« Livraison impossible »)',
    );

    // --- Web : deux pages Stripe Checkout enchaînées -------------------------------------------
    const web = await call('create-order', client, {
      merchantId: SAMIR,
      items: [{ itemId: MENU, quantity: 1 }],
      channel: 'web',
      delivery: ADDRESS,
    });
    if (!web.body.checkoutUrl)
      throw new Error('checkoutUrl manquant : ' + JSON.stringify(web.body));
    const order3 = web.body.orderId;
    const sessions = row(
      order3,
      `stripe_checkout_session_id || '|' || delivery_checkout_session_id`,
    );
    const [mealSession, deliverySession] = sessions.split('|');
    if (!mealSession || !deliverySession) throw new Error('sessions : ' + sessions);
    await connectEvent('checkout.session.completed', {
      id: mealSession,
      mode: 'payment',
      payment_intent: 'pi_web_repas',
      amount_total: 950,
      metadata: { order_id: order3, kind: 'meal' },
    });
    expect(row(order3, 'status'), 'pending_payment', 'repas payé, course pas encore');
    await connectEvent(
      'checkout.session.completed',
      {
        id: deliverySession,
        mode: 'payment',
        payment_intent: 'pi_web_course',
        amount_total: 350,
        metadata: { order_id: order3, kind: 'delivery' },
      },
      'acct_demo_karim',
    );
    expect(
      row(order3, `status || '|' || delivery_payment_intent_id`),
      'placed|pi_web_course',
      'web payé',
    );
    const cancelled = await call('customer-cancel-order', client, { orderId: order3 });
    expect(cancelled.body.status, 'cancelled', 'annulation client');
    step(
      'web : page du repas puis page de la course ; la commande part après les deux ; annulation sans débit',
    );

    // --- Garde-fous ------------------------------------------------------------------------
    const far = await call('create-order', client, {
      merchantId: SAMIR,
      items: [{ itemId: MENU, quantity: 1 }],
      channel: 'native',
      delivery: { ...ADDRESS, latitude: 48.95, longitude: 2.45 },
    });
    expect(far.body.error, 'delivery_out_of_range', 'hors zone');
    sql(`update couriers set is_available = false where id = '${KARIM}'`);
    const none = await call('create-order', client, {
      merchantId: SAMIR,
      items: [{ itemId: MENU, quantity: 1 }],
      channel: 'native',
      delivery: ADDRESS,
    });
    sql(`update couriers set is_available = true where id = '${KARIM}'`);
    expect(none.body.error, 'no_courier_available', 'aucun livreur');
    step('refus : adresse hors zone, aucun livreur disponible');

    // --- Nouveau livreur : profil, Stripe Connect, abonnement ----------------------------------
    const email = `livreur${Date.now()}@zeroo.test`;
    await fetch(`${AUTH_URL}/signup`, {
      method: 'POST',
      headers: { apikey: ANON, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'motdepasse1' }),
    });
    sql(`update auth.users set email_confirmed_at = now() where email = '${email}'`);
    const lea = await signIn(email);
    expect(
      (await call('connect-onboarding', lea, { action: 'link', role: 'courier' })).body.error,
      'courier_profile_required',
      'profil requis',
    );
    // SIRET de test unique (clé de Luhn calculée).
    const base = String(Date.now()).slice(-13).padStart(13, '1');
    const siret = [...Array(10).keys()]
      .map((k) => base + k)
      .find(
        (s) =>
          [...s].reduce((sum, c, i) => {
            let d = Number(c);
            if (i % 2 === 0) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
            return sum + d;
          }, 0) %
            10 ===
          0,
      );
    const profile = await rpc('create_courier', lea, {
      p_display_name: 'Léa Martin',
      p_phone: '06 11 22 33 44',
      p_legal_status: 'auto_entrepreneur',
      p_siret: siret,
      p_vehicle: 'bike',
    });
    expect(profile.status, 200, 'profil : ' + JSON.stringify(profile.body));
    const leaId = profile.body.id;
    const link = await call('connect-onboarding', lea, { action: 'link', role: 'courier' });
    if (!link.body.url) throw new Error('lien Connect : ' + JSON.stringify(link.body));
    const account = sql(
      `select stripe_account_id from courier_stripe_accounts where courier_id = '${leaId}'`,
    );
    await connectEvent(
      'account.updated',
      { id: account, charges_enabled: true, payouts_enabled: true, details_submitted: true },
      account,
    );
    expect(
      sql(`select charges_enabled from courier_stripe_accounts where courier_id = '${leaId}'`),
      't',
      'compte livreur activé',
    );
    const checkout = await call('billing', lea, { action: 'checkout', role: 'courier' });
    if (!checkout.body.url) throw new Error('abonnement : ' + JSON.stringify(checkout.body));
    const customer = sql(
      `select stripe_customer_id from courier_subscriptions where courier_id = '${leaId}'`,
    );
    await webhook(
      'customer.subscription.updated',
      {
        id: `sub_${leaId.slice(0, 8)}`,
        object: 'subscription',
        customer,
        status: 'trialing',
        trial_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        cancel_at_period_end: false,
        items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
      },
      PLATFORM_SECRET,
    );
    expect(
      sql(`select status from courier_subscriptions where courier_id = '${leaId}'`),
      'trialing',
      'essai de 30 jours',
    );
    expect(
      (await rpc('set_courier_availability', lea, { p_available: true })).body.message,
      'courier_no_merchant',
      'restaurant requis',
    );
    await rpc('request_merchant_link', lea, { p_merchant_id: SAMIR });
    await rpc('decide_courier_link', merchant, { p_courier_id: leaId, p_approve: true });
    expect(
      (await rpc('set_courier_availability', lea, { p_available: true })).body.is_available,
      true,
      'Léa disponible',
    );
    step(
      'nouveau livreur : profil (SIRET), compte Stripe Connect activé par webhook, abonnement 30 € avec essai, rattachement accepté par le restaurant, disponible',
    );
  } finally {
    // Seul Karim reste disponible : les autres tests attendent que la course lui revienne.
    sql(`update couriers set is_available = false where id <> '${KARIM}'`);
    server.close();
  }
});
