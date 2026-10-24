// Notifications push et « Je pars maintenant », côté serveur, avec de faux services
// Expo Push et Google Routes démarrés par ce test.
//
// Prérequis : fonctions servies avec EXPO_PUSH_URL=http://<hôte>:54500/push,
// GOOGLE_ROUTES_URL=http://<hôte>:54501/routes, GOOGLE_ROUTES_API_KEY=test-key, CRON_SECRET=cron_test.
// E2E_DB_FUNCTIONS_URL : URL des fonctions vue depuis la base (pg_net), par défaut celle de Kong.
const http = require('http');

const { ANON, AUTH_URL, FUNCTIONS, connectEvent, run, sql, step } = require('../helpers');

const DB_FUNCTIONS_URL =
  process.env.E2E_DB_FUNCTIONS_URL ?? 'http://supabase_kong_zeroo:8000/functions/v1';
const CRON_SECRET = process.env.CRON_SECRET ?? 'cron_test';
const SAMIR = '30000000-0000-0000-0000-000000000001';
const KEBAB = '50000000-0000-0000-0000-000000000003';

// --- Faux services ----------------------------------------------------------------
const pushes = [];
const googleRequests = [];
function listen(port, handler) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => handler(req, JSON.parse(body || '{}'), res));
  });
  return new Promise((resolve) => server.listen(port, '0.0.0.0', () => resolve(server)));
}
const reply = (res, body) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

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
  return (await res.json()).access_token;
}

async function call(name, token, body) {
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function rest(path, token, body) {
  const res = await fetch(`${AUTH_URL.replace('/auth/v1', '/rest/v1')}/${path}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} : ${res.status} ${await res.text()}`);
}

run('Notifications et trajet', async () => {
  const servers = [
    await listen(54500, (req, body, res) => {
      pushes.push(...body);
      reply(res, {
        data: body.map((m) =>
          m.to === 'ExponentPushToken[ancien]'
            ? {
                status: 'error',
                message: 'désinstallée',
                details: { error: 'DeviceNotRegistered' },
              }
            : { status: 'ok', id: `ticket-${pushes.length}` },
        ),
      });
    }),
    await listen(54501, (req, body, res) => {
      googleRequests.push({ headers: req.headers, body });
      reply(res, { routes: [{ duration: '540s', distanceMeters: 650 }] });
    }),
  ];

  try {
    // Le trigger de la base appelle notify-order-update via pg_net (secrets Vault).
    sql(`delete from vault.secrets where name in ('functions_url', 'cron_secret')`);
    sql(`select vault.create_secret('${DB_FUNCTIONS_URL}', 'functions_url')`);
    sql(`select vault.create_secret('${CRON_SECRET}', 'cron_secret')`);
    sql(`update merchants set is_paused = false where id = '${SAMIR}'`);
    sql(`delete from merchant_opening_hours where merchant_id = '${SAMIR}'`);
    sql(
      `insert into merchant_opening_hours (merchant_id, weekday, opens_at, closes_at) select '${SAMIR}', d, t.o, t.c from generate_series(1,7) d, (values ('00:00'::time,'12:00'::time),('12:00'::time,'00:00'::time)) t(o,c)`,
    );
    sql(`delete from push_tokens`);

    const client = await signIn('client@zeroo.test');
    const merchant = await signIn('commercant@zeroo.test');
    await rest('rpc/register_push_token', client, {
      p_token: 'ExponentPushToken[nadia]',
      p_platform: 'ios',
    });
    await rest('rpc/register_push_token', merchant, {
      p_token: 'ExponentPushToken[samir]',
      p_platform: 'android',
    });
    await rest('rpc/register_push_token', merchant, {
      p_token: 'ExponentPushToken[ancien]',
      p_platform: 'android',
    });
    step(
      'appareils enregistrés : Nadia (iPhone), Samir (Android + un ancien téléphone désinstallé)',
    );

    const blanche = sql(
      `select o.id from menu_options o join menu_option_groups g on g.id = o.group_id where g.item_id = '${KEBAB}' and o.name = 'Blanche'`,
    );
    const items = [{ itemId: KEBAB, quantity: 2, optionIds: [blanche] }];
    const created = await call('create-order', client, {
      merchantId: SAMIR,
      items,
      channel: 'native',
    });
    const orderId = created.body.orderId;
    await connectEvent('payment_intent.amount_capturable_updated', {
      id: sql(`select stripe_payment_intent_id from orders where id = '${orderId}'`),
      amount_capturable: 1500,
      metadata: { order_id: orderId },
    });
    const newOrder = await waitForPush('ExponentPushToken[samir]', 'Nouvelle commande');
    if (
      newOrder.body !== 'Nadia · 15,00 €' ||
      newOrder.sound !== 'new-order.wav' ||
      newOrder.channelId !== 'orders' ||
      newOrder.data.url !== '/pro'
    ) {
      throw new Error('notification commerçant inattendue : ' + JSON.stringify(newOrder));
    }
    await new Promise((r) => setTimeout(r, 500));
    if (
      sql(`select count(*) from push_tokens where expo_token = 'ExponentPushToken[ancien]'`) !== '0'
    )
      throw new Error('appareil désinstallé non supprimé');
    step(
      'paiement autorisé → « Nouvelle commande 🔔 Nadia · 15,00 € » avec la sonnerie ; appareil désinstallé supprimé',
    );

    await call('order-decision', merchant, { orderId, decision: 'accept', prepMinutes: 15 });
    const accepted = await waitForPush('ExponentPushToken[nadia]', 'Commande acceptée');
    if (
      !/^Chez Samir prépare votre commande, prête vers \d\d:\d\d\.$/.test(accepted.body) ||
      accepted.data.url !== `/order/${orderId}`
    ) {
      throw new Error('notification client inattendue : ' + JSON.stringify(accepted));
    }
    step(`acceptation → client : « ${accepted.body} » (ouvre le suivi de la commande)`);

    // « Je pars maintenant »
    {
      const other = await call('customer-departure', merchant, {
        orderId,
        latitude: 48.87,
        longitude: 2.33,
        mode: 'walk',
      });
      if (other.status !== 404) throw new Error('départ annoncé par un autre : ' + other.status);
      const invalid = await call('customer-departure', client, {
        orderId,
        latitude: 48.87,
        longitude: 2.33,
        mode: 'fusée',
      });
      if (invalid.status !== 400) throw new Error('mode invalide accepté');
    }
    const departure = await call('customer-departure', client, {
      orderId,
      latitude: 48.8738,
      longitude: 2.3316,
      mode: 'walk',
    });
    if (departure.body.source !== 'google' || departure.body.travelSeconds !== 540)
      throw new Error('trajet : ' + JSON.stringify(departure.body));
    const google = googleRequests.at(-1);
    if (
      google.headers['x-goog-api-key'] !== 'test-key' ||
      google.body.travelMode !== 'WALK' ||
      google.body.routingPreference
    ) {
      throw new Error('requête Google inattendue : ' + JSON.stringify(google));
    }
    const eta = sql(
      `select round(extract(epoch from customer_eta_at - customer_departed_at)) || '|' || customer_travel_mode from orders where id = '${orderId}'`,
    );
    if (eta !== '540|walk') throw new Error("heure d'arrivée : " + eta);
    const enRoute = await waitForPush('ExponentPushToken[samir]', 'Client en route 🚶');
    if (!/^Nadia arrive vers \d\d:\d\d \(dans 9 min\) · commande /.test(enRoute.body))
      throw new Error('notification trajet : ' + enRoute.body);
    step(
      `« Je pars maintenant » à pied → Google Routes (WALK, clé serveur) : 9 min ; commerçant : « ${enRoute.body} »`,
    );

    const again = await call('customer-departure', client, {
      orderId,
      latitude: 48.8738,
      longitude: 2.3316,
      mode: 'walk',
    });
    if (!again.body.throttled || googleRequests.length !== 1)
      throw new Error('limitation : ' + JSON.stringify(again.body));
    // Seule l'adresse d'une livraison est conservée (effacée 7 jours après) : jamais la
    // position du client qui part chercher sa commande.
    if (
      sql(
        `select count(*) from information_schema.columns where table_name = 'orders' and column_name ilike '%latitude%' and column_name <> 'delivery_latitude'`,
      ) !== '0' ||
      sql(
        `select count(*) from orders where id = '${orderId}' and delivery_latitude is not null`,
      ) !== '0'
    )
      throw new Error('position stockée');
    step('second appel dans la minute : pas de nouvel appel à Google ; aucune position stockée');

    await rest('rpc/set_order_status', merchant, { p_order_id: orderId, p_status: 'ready' });
    const code = sql(`select pickup_code from orders where id = '${orderId}'`);
    const ready = await waitForPush('ExponentPushToken[nadia]', 'C’est prêt');
    if (!ready.body.endsWith(`Code de retrait : ${code}`))
      throw new Error('notification prête : ' + ready.body);
    step(`commande prête → client : « ${ready.body} »`);

    // Annulation par le client : le commerçant est prévenu.
    const second = await call('create-order', client, {
      merchantId: SAMIR,
      items,
      channel: 'native',
    });
    await connectEvent('payment_intent.amount_capturable_updated', {
      id: sql(`select stripe_payment_intent_id from orders where id = '${second.body.orderId}'`),
      amount_capturable: 1500,
      metadata: { order_id: second.body.orderId },
    });
    await waitForPush('ExponentPushToken[samir]', 'Nouvelle commande');
    await call('customer-cancel-order', client, { orderId: second.body.orderId });
    const cancelled = await waitForPush('ExponentPushToken[samir]', 'Commande annulée');
    step(`annulation par le client → commerçant : « ${cancelled.body} »`);

    // Refus : le client sait qu'il n'est pas débité.
    const third = await call('create-order', client, {
      merchantId: SAMIR,
      items,
      channel: 'native',
    });
    await connectEvent('payment_intent.amount_capturable_updated', {
      id: sql(`select stripe_payment_intent_id from orders where id = '${third.body.orderId}'`),
      amount_capturable: 1500,
      metadata: { order_id: third.body.orderId },
    });
    await call('order-decision', merchant, {
      orderId: third.body.orderId,
      decision: 'refuse',
      reason: 'Produit en rupture',
    });
    const refused = await waitForPush('ExponentPushToken[nadia]', 'Commande non acceptée');
    if (!refused.body.includes('(Produit en rupture)') || !refused.body.includes('pas été débité'))
      throw new Error('refus : ' + refused.body);
    step(`refus → client : « ${refused.body} »`);

    const wrongSecret = await fetch(`${FUNCTIONS}/notify-order-update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cron-secret': 'faux' },
      body: JSON.stringify({ order_id: orderId, status: 'ready' }),
    });
    if (wrongSecret.status !== 401)
      throw new Error('notify-order-update sans secret : ' + wrongSecret.status);
    step('notify-order-update refuse les appels sans le secret interne');
  } finally {
    sql(`delete from vault.secrets where name in ('functions_url', 'cron_secret')`);
    servers.forEach((s) => s.close());
  }
});
