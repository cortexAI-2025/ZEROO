#!/usr/bin/env node
// Recette des notifications (Edge Function notify-order-update) sur la pile LOCALE : un faux serveur Expo Push enregistre les envois.
// On appelle la fonction comme le déclencheur de la base (en-tête x-cron-secret) après de vraies transitions de commande.
//   RECETTE_PASSWORD=… node docs/recette/e2e_notifications.mjs [fichier-de-preuve]
// Prérequis : functions_serve.sh démarré avec EXPO_PUSH_URL=http://127.0.0.1:8199/push (valeur par défaut du script).
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const W = process.env.HTTP_STACK_DIR ?? '/tmp/zeeroo-http';
const keys = JSON.parse(readFileSync(`${W}/keys.json`, 'utf8'));
const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const PASSWORD = process.env.RECETTE_PASSWORD;
if (!PASSWORD) {
  console.error('RECETTE_PASSWORD requis');
  process.exit(64);
}
const proof = process.argv[2];
const mask = (s) =>
  String(s)
    .replace(/eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+){0,2}/g, '[JETON-MASQUÉ]')
    .replaceAll(PASSWORD, '[MDP-MASQUÉ]');
if (proof) writeFileSync(proof, '', { mode: 0o600 });
const out = (l) => {
  const m = mask(l);
  console.log(m);
  if (proof) appendFileSync(proof, m + '\n');
};
let ok = 0,
  fail = 0;
const check = (cond, name, detail = '') => {
  cond ? ok++ : fail++;
  out(`${cond ? 'OK     ' : 'ÉCHEC  '} ${name}${detail ? ' — ' + detail : ''}`);
  return cond;
};
const sql = (q) =>
  execFileSync(
    'psql',
    ['-X', '-At', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-c', q],
    { env: process.env },
  )
    .toString()
    .trim();

// Faux serveur Expo Push : enregistre les messages ; peut simuler « appareil désinstallé » ou une panne.
let received = [];
let mode = 'ok';
const expo = http
  .createServer((q, r) => {
    let body = '';
    q.on('data', (c) => (body += c));
    q.on('end', () => {
      if (mode === 'down') {
        r.writeHead(503);
        return r.end('indisponible');
      }
      const msgs = JSON.parse(body);
      received.push(...msgs);
      const data = msgs.map((m) =>
        mode === 'stale'
          ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
          : { status: 'ok', id: 'tk' },
      );
      r.writeHead(200, { 'content-type': 'application/json' });
      r.end(JSON.stringify({ data }));
    });
  })
  .listen(8199, '127.0.0.1');

async function http_(method, url, token, body, extra = {}, attempt = 1) {
  try {
    const r = await fetch(url, {
      method,
      headers: {
        apikey: keys.anon,
        Authorization: `Bearer ${token ?? keys.anon}`,
        'Content-Type': 'application/json',
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const t = await r.text();
    let j = null;
    try {
      j = JSON.parse(t);
    } catch {
      /* non JSON */
    }
    return { status: r.status, json: j };
  } catch (e) {
    // connexion « keep-alive » refermée par la passerelle locale entre deux appels : on réessaie une fois
    if (attempt < 3) return http_(method, url, token, body, extra, attempt + 1);
    return { status: 0, json: null, text: String(e) };
  }
}
const login = async (email) =>
  (
    await http_('POST', `${API}/auth/v1/token?grant_type=password`, null, {
      email,
      password: PASSWORD,
    })
  ).json?.access_token;
const rpc = (n, t, a = {}) => http_('POST', `${API}/rest/v1/rpc/${n}`, t, a);
const fn = (n, t, b) => http_('POST', `${API}/functions/v1/${n}`, t, b);
const notify = (order_id, status, previous_status, event, secret = 'local-cron') =>
  http_(
    'POST',
    `${API}/functions/v1/notify-order-update`,
    null,
    { order_id, status, previous_status, ...(event ? { event } : {}) },
    secret ? { 'x-cron-secret': secret } : {},
  );
const to = (token) => received.filter((m) => m.to === token);
const last = (token) => to(token).at(-1);

const T = {};
for (const [k, e] of Object.entries({
  client: 'client@zeroo.test',
  resto: 'commercant@zeroo.test',
  livreur: 'livreur@zeroo.test',
})) {
  T[k] = await login(e);
  if (!T[k]) {
    out(`ERREUR-TECHNIQUE connexion ${k}`);
    process.exit(2);
  }
}
const uid = (email) => sql(`select id from auth.users where email='${email}'`);
const tok = {
  client: 'ExponentPushToken[client-test]',
  resto: 'ExponentPushToken[resto-test]',
  livreur: 'ExponentPushToken[livreur-test]',
};
sql(`delete from public.push_tokens where expo_token like 'ExponentPushToken[%-test]'`);
for (const [k, e] of Object.entries({
  client: 'client@zeroo.test',
  resto: 'commercant@zeroo.test',
  livreur: 'livreur@zeroo.test',
}))
  sql(
    `insert into public.push_tokens (user_id, expo_token, platform) values ('${uid(e)}', '${tok[k]}', 'android') on conflict do nothing`,
  );
out(`# Recette des notifications — ${new Date().toISOString()} — pile locale ${API}`);

const SAMIR = '30000000-0000-0000-0000-000000000001';
const item = (
  (
    await http_(
      'GET',
      `${API}/rest/v1/menu_items?select=id,menu_option_groups(min_select)&merchant_id=eq.${SAMIR}&is_available=eq.true`,
      T.client,
    )
  ).json ?? []
).find((i) => (i.menu_option_groups ?? []).every((g) => g.min_select === 0));
const lines = [{ itemId: item.id, quantity: 1 }];
const addr = {
  addressLine: '12 rue de Rivoli',
  postalCode: '75001',
  city: 'Paris',
  latitude: 48.8606,
  longitude: 2.3376,
  phone: '0612345678',
};
await rpc('set_courier_availability', T.livreur, { p_available: true });
await rpc('courier_heartbeat', T.livreur);

out('\n## Sécurité de l’appel');
const probe = (
  await fn('create-order', T.client, { merchantId: SAMIR, items: lines, mealPayment: 'card' })
).json?.orderId;
check(
  (await notify(probe, 'placed', null, undefined, null)).status === 401,
  'N0 Sans secret : 401 (la fonction n’est pas appelable publiquement)',
);
check(
  (await notify(probe, 'placed', null, undefined, 'mauvais')).status === 401,
  'N0 Mauvais secret : 401',
);
received = [];
const unknown = await notify('00000000-0000-0000-0000-000000000000', 'placed', null);
check(
  unknown.status === 200 && unknown.json?.sent === 0,
  'N0 Commande inconnue : 200, aucun envoi',
);

out('\n## Retrait : commerçant et client');
let r = await notify(probe, 'placed', null);
check(
  r.json?.sent === 1 && to(tok.resto).length === 1 && to(tok.client).length === 0,
  'N1 Nouvelle commande : seul le commerçant est notifié',
  last(tok.resto)?.title,
);
check(
  /Nouvelle commande/.test(last(tok.resto)?.title ?? '') && last(tok.resto)?.data?.url === '/pro',
  'N1 …titre « Nouvelle commande » et ouverture du tableau de bord',
);
received = [];
await fn('order-decision', T.resto, { orderId: probe, decision: 'accept', prepMinutes: 12 });
r = await notify(probe, 'accepted', 'placed');
check(
  to(tok.client).length === 1 && to(tok.resto).length === 0,
  'N2 Commande acceptée : seul le client est notifié',
  last(tok.client)?.title,
);
check(last(tok.client)?.data?.url === `/order/${probe}`, 'N2 …un appui ouvre la commande');
received = [];
await rpc('set_order_status', T.resto, { p_order_id: probe, p_status: 'ready' });
await notify(probe, 'ready', 'accepted');
check(
  to(tok.client).length === 1 && /prêt/i.test(JSON.stringify(last(tok.client))),
  'N3 Commande prête : le client est prévenu',
  last(tok.client)?.title,
);

out('\n## Refus et annulation');
const o2 = (
  await fn('create-order', T.client, { merchantId: SAMIR, items: lines, mealPayment: 'card' })
).json?.orderId;
await fn('order-decision', T.resto, {
  orderId: o2,
  decision: 'refuse',
  reason: 'Rupture de stock',
});
received = [];
await notify(o2, 'refused', 'placed');
check(
  to(tok.client).length === 1 && /Rupture de stock/.test(last(tok.client)?.body ?? ''),
  'N4 Refus : le client reçoit le motif',
  last(tok.client)?.body,
);
const o3 = (
  await fn('create-order', T.client, { merchantId: SAMIR, items: lines, mealPayment: 'card' })
).json?.orderId;
await fn('customer-cancel-order', T.client, { orderId: o3 });
received = [];
await notify(o3, 'cancelled', 'placed');
check(
  to(tok.resto).length === 1 && to(tok.client).length === 0,
  'N5 Annulation par le client : le commerçant est prévenu',
  last(tok.resto)?.title,
);

out('\n## Livraison : livreur et client');
const d = (
  await fn('create-order', T.client, {
    merchantId: SAMIR,
    items: lines,
    mealPayment: 'card',
    deliveryPayment: 'cash',
    delivery: addr,
  })
).json?.orderId;
await fn('order-decision', T.resto, { orderId: d, decision: 'accept', prepMinutes: 10 });
received = [];
await notify(d, 'accepted', 'placed', 'mission_available');
check(
  to(tok.livreur).length === 1 && /mission/i.test(last(tok.livreur)?.title ?? ''),
  'N6 Mission disponible : le livreur en ligne est notifié',
  last(tok.livreur)?.title,
);
check(
  !/12 rue de Rivoli/.test(JSON.stringify(received)),
  'N6 L’adresse de livraison n’est jamais envoyée au service de notification (ville seulement)',
);
sql(`update public.couriers set is_available=false where user_id='${uid('livreur@zeroo.test')}'`);
received = [];
await notify(d, 'accepted', 'placed', 'mission_available');
check(to(tok.livreur).length === 0, 'N6 Livreur indisponible : aucune notification');
await rpc('set_courier_availability', T.livreur, { p_available: true });
await rpc('courier_accept_mission', T.livreur, { p_order_id: d });
received = [];
await notify(d, 'accepted', 'placed', 'courier_assigned');
check(
  to(tok.client).length >= 1 &&
    /livreur|Karim|prend votre livraison/i.test(JSON.stringify(last(tok.client))),
  'N7 Livreur affecté : le client est prévenu',
  last(tok.client)?.title,
);
await rpc('set_order_status', T.resto, { p_order_id: d, p_status: 'ready' });
const pc = (
  await http_('GET', `${API}/rest/v1/orders?select=pickup_code,delivery_code&id=eq.${d}`, T.client)
).json?.[0];
await rpc('set_order_status', T.resto, {
  p_order_id: d,
  p_status: 'out_for_delivery',
  p_pickup_code: pc.pickup_code,
});
received = [];
await notify(d, 'out_for_delivery', 'ready');
check(
  to(tok.client).length === 1 && /route/i.test(last(tok.client)?.title ?? ''),
  'N8 En route : le client est prévenu',
  last(tok.client)?.title,
);
await rpc('courier_mark_delivered', T.livreur, {
  p_order_id: d,
  p_delivery_code: pc.delivery_code,
});
received = [];
await notify(d, 'delivered', 'out_for_delivery');
check(
  to(tok.client).length === 1 && /livrée/i.test(last(tok.client)?.title ?? ''),
  'N9 Livrée : le client est prévenu',
  last(tok.client)?.title,
);

out('\n## Robustesse');
sql(`delete from public.push_tokens where user_id='${uid('commercant@zeroo.test')}'`);
received = [];
r = await notify(probe, 'placed', null);
check(
  r.status === 200 && r.json?.sent === 0,
  'R1 Destinataire sans appareil enregistré : 200, aucun envoi, aucune erreur',
);
sql(
  `insert into public.push_tokens (user_id, expo_token, platform) values ('${uid('commercant@zeroo.test')}', '${tok.resto}', 'android') on conflict do nothing`,
);
mode = 'down';
received = [];
r = await notify(probe, 'placed', null);
check(
  r.status === 200,
  'R2 Service Expo en panne : la fonction répond 200 (une notification manquée ne casse jamais une commande)',
  `HTTP ${r.status}`,
);
mode = 'stale';
received = [];
await notify(probe, 'placed', null);
check(
  sql(`select count(*) from public.push_tokens where expo_token='${tok.resto}'`) === '0',
  'R3 Appareil désinstallé (DeviceNotRegistered) : son jeton est supprimé',
);
mode = 'ok';
const big = [];
for (let i = 0; i < 230; i++)
  big.push(`('${uid('commercant@zeroo.test')}', 'ExponentPushToken[bulk-${i}-test]', 'android')`);
sql(`insert into public.push_tokens (user_id, expo_token, platform) values ${big.join(',')}`);
received = [];
await notify(probe, 'placed', null);
check(
  received.length === 230,
  'R4 230 appareils : tous reçoivent le message (lots de 100)',
  `${received.length} reçus`,
);
sql(`delete from public.push_tokens where expo_token like 'ExponentPushToken[%-test]'`);
for (const id of [probe, o2, o3, d])
  sql(
    `update public.orders set status='cancelled' where id='${id}' and status not in ('delivered','collected','refused','cancelled')`,
  );

expo.close();
out(`\n# Bilan : ${ok} OK, ${fail} ÉCHEC`);
process.exit(fail ? 1 : 0);
