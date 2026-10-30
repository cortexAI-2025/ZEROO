#!/usr/bin/env node
// Recette de bout en bout des trois espaces (Client, Restaurant, Livreur) sur la pile LOCALE (http_stack.sh +
// functions_serve.sh) : PostgREST, GoTrue et Edge Functions réels, Stripe simulé, données fictives. Aucune production.
//   RECETTE_PASSWORD=… node docs/recette/e2e_web_flow.mjs [fichier-de-preuve]
// Parcours : A livraison complète (client → restaurant → livreur → remise → livraison → historique),
// B click & collect sans livreur, C annulation client, D refus par le restaurant, E contrôles d'isolation et d'erreur.
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

async function http(method, url, token, body, extra = {}) {
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
    return { status: r.status, json: j, text: t };
  } catch (e) {
    return { status: 0, json: null, text: String(e) };
  }
}
const login = async (email) =>
  (
    await http('POST', `${API}/auth/v1/token?grant_type=password`, null, {
      email,
      password: PASSWORD,
    })
  ).json?.access_token ?? null;
const rpc = (name, token, args = {}) => http('POST', `${API}/rest/v1/rpc/${name}`, token, args);
const fn = (name, token, body) => http('POST', `${API}/functions/v1/${name}`, token, body);
const getOrder = async (token, id) =>
  (await http('GET', `${API}/rest/v1/orders?select=*&id=eq.${id}`, token)).json?.[0] ?? null;

const T = {};
for (const [k, e] of Object.entries({
  client: 'client@zeroo.test',
  client2: 'client2@zeroo.test',
  resto: 'commercant@zeroo.test',
  resto2: 'commercant2@zeroo.test',
  livreur: 'livreur@zeroo.test',
})) {
  T[k] = await login(e);
  if (!T[k]) {
    out(`ERREUR-TECHNIQUE connexion ${k}`);
    process.exit(2);
  }
}
out(`# Recette de bout en bout — ${new Date().toISOString()} — pile locale ${API}`);

const SAMIR = '30000000-0000-0000-0000-000000000001';
const items =
  (
    await http(
      'GET',
      `${API}/rest/v1/menu_items?select=id,name,price_cents,menu_option_groups(min_select)&merchant_id=eq.${SAMIR}&is_available=eq.true`,
      T.client,
    )
  ).json ?? [];
const item = items.find((i) => (i.menu_option_groups ?? []).every((g) => g.min_select === 0));
check(!!item, 'Client : le menu du restaurant est lisible et contient un article commandable');
const lines = [{ itemId: item.id, quantity: 2 }];
const addr = {
  addressLine: '12 rue de Rivoli',
  postalCode: '75001',
  city: 'Paris',
  latitude: 48.8606,
  longitude: 2.3376,
  phone: '0612345678',
};

// ── Préparation : le livreur est disponible, le restaurant accepte la carte (lien de paiement) ─────────────────────
const dispo = await rpc('set_courier_availability', T.livreur, { p_available: true });
check(dispo.status < 300, 'Livreur : se déclare disponible', `HTTP ${dispo.status}`);
await rpc('courier_heartbeat', T.livreur);

// ── A. Livraison complète ──────────────────────────────────────────────────────────────────────────────────────────
out('\n## A. Livraison : client → restaurant → livreur → remise → livraison → historique');
const quote = await rpc('merchant_delivery_quote', T.client, { m: undefined }).catch(() => null);
const a = await fn('create-order', T.client, {
  merchantId: SAMIR,
  items: lines,
  mealPayment: 'card',
  deliveryPayment: 'cash',
  delivery: addr,
});
check(
  a.status === 200 && a.json?.orderId,
  'A1 Client : crée une commande en livraison',
  `HTTP ${a.status} ${a.json?.error ?? ''}`,
);
const A = a.json?.orderId;
if (A) {
  let o = await getOrder(T.client, A);
  check(
    o?.status === 'placed' && o?.fulfillment === 'delivery',
    'A1 Statut « placed » (envoyée au restaurant), mode livraison',
    `${o?.status}/${o?.fulfillment}`,
  );
  check(
    o?.total_cents > 0 && o?.total_cents === item.price_cents * 2,
    'A1 Total recalculé côté base (2 × prix de l’article)',
    `${o?.total_cents} / ${item.price_cents * 2}`,
  );
  const other = await getOrder(T.client2, A);
  check(other === null, 'A1 Isolation : un autre client ne voit pas cette commande');
  const restoSees = await getOrder(T.resto, A);
  check(restoSees?.id === A, 'A2 Restaurant : reçoit la commande');
  const resto2Sees = await getOrder(T.resto2, A);
  check(resto2Sees === null, 'A2 Isolation : un autre restaurant ne la voit pas');
  const dec = await fn('order-decision', T.resto, {
    orderId: A,
    decision: 'accept',
    prepMinutes: 15,
  });
  check(
    dec.status === 200,
    'A2 Restaurant : accepte (15 min)',
    `HTTP ${dec.status} ${dec.json?.error ?? ''}`,
  );
  const mis = await rpc('available_missions', T.livreur);
  check(
    Array.isArray(mis.json) && mis.json.some((m) => m.order_id === A || m.id === A),
    'A3 Livreur : la mission apparaît dans les missions disponibles',
    `${mis.json?.length ?? '?'} mission(s)`,
  );
  const acc = await rpc('courier_accept_mission', T.livreur, { p_order_id: A });
  check(
    acc.status < 300,
    'A3 Livreur : accepte la mission',
    `HTTP ${acc.status} ${acc.json?.message ?? ''}`,
  );
  const acc2 = await rpc('courier_accept_mission', T.livreur, { p_order_id: A });
  check(
    acc2.json?.message === 'mission_unavailable',
    'A3 Double acceptation : refusée avec le code métier « mission_unavailable » (PostgREST renvoie HTTP 500 pour P0002 ; l’application lit le message)',
    `HTTP ${acc2.status} ${acc2.json?.message ?? ''}`,
  );
  const prep = await rpc('set_order_status', T.resto, { p_order_id: A, p_status: 'preparing' });
  check(prep.status < 300, 'A4 Restaurant : passe en préparation', `HTTP ${prep.status}`);
  const ready = await rpc('set_order_status', T.resto, { p_order_id: A, p_status: 'ready' });
  check(ready.status < 300, 'A4 Restaurant : commande prête', `HTTP ${ready.status}`);
  o = await getOrder(T.client, A);
  const pickup = o?.pickup_code;
  const badCode = await rpc('set_order_status', T.resto, {
    p_order_id: A,
    p_status: 'out_for_delivery',
    p_pickup_code: 'ZZZZ',
  });
  check(
    badCode.status >= 400,
    'A4 Remise au livreur avec un mauvais code : refusée',
    `HTTP ${badCode.status}`,
  );
  const hand = await rpc('set_order_status', T.resto, {
    p_order_id: A,
    p_status: 'out_for_delivery',
    p_pickup_code: pickup,
  });
  check(
    hand.status < 300,
    'A4 Restaurant : remet la commande au livreur (code de retrait)',
    `HTTP ${hand.status} ${hand.json?.message ?? ''}`,
  );
  const wrong = await rpc('courier_mark_delivered', T.livreur, {
    p_order_id: A,
    p_delivery_code: '0000',
  });
  check(
    wrong.status >= 400,
    'A5 Livraison avec un mauvais code client : refusée',
    `HTTP ${wrong.status}`,
  );
  const code = (await getOrder(T.client, A))?.delivery_code;
  check(!!code, 'A5 Client : voit son code de livraison');
  const delCodeVisibleToOther = await getOrder(T.client2, A);
  check(
    delCodeVisibleToOther === null,
    'A5 Isolation : le code de livraison n’est pas lisible par un autre client',
  );
  const done = await rpc('courier_mark_delivered', T.livreur, {
    p_order_id: A,
    p_delivery_code: code,
  });
  check(
    done.status < 300,
    'A5 Livreur : confirme la livraison avec le code du client',
    `HTTP ${done.status} ${done.json?.message ?? ''}`,
  );
  o = await getOrder(T.client, A);
  check(
    o?.status === 'delivered' && !!o?.delivered_at,
    'A6 Client : voit la commande terminée',
    o?.status,
  );
  const hist =
    (
      await http(
        'GET',
        `${API}/rest/v1/orders?select=id,status&customer_id=eq.${sql("select id from auth.users where email='client@zeroo.test'")}&order=created_at.desc`,
        T.client,
      )
    ).json ?? [];
  check(
    hist.some((h) => h.id === A && h.status === 'delivered'),
    'A6 Client : la commande figure dans son historique',
  );
  const earn = await rpc('courier_earnings_summary', T.livreur, {});
  check(earn.status < 300, 'A6 Livreur : revenus / historique accessibles', `HTTP ${earn.status}`);
  const stats = await rpc('merchant_today_summary', T.resto, { p_merchant_id: SAMIR });
  check(stats.status < 300, 'A6 Restaurant : synthèse du jour accessible', `HTTP ${stats.status}`);
}

// ── B. Click & collect sans livreur ────────────────────────────────────────────────────────────────────────────────
out('\n## B. Click & collect sans livreur');
const b = await fn('create-order', T.client, {
  merchantId: SAMIR,
  items: lines,
  mealPayment: 'card',
});
check(
  b.status === 200 && b.json?.orderId,
  'B1 Client : crée une commande à emporter',
  `HTTP ${b.status} ${b.json?.error ?? ''}`,
);
const B = b.json?.orderId;
if (B) {
  const ob = await getOrder(T.client, B);
  check(
    ob?.fulfillment === 'pickup' && ob?.courier_id === null,
    'B1 Aucun livreur affecté (retrait sur place)',
  );
  check(
    (await fn('order-decision', T.resto, { orderId: B, decision: 'accept', prepMinutes: 10 }))
      .status === 200,
    'B2 Restaurant : accepte',
  );
  const mis = await rpc('available_missions', T.livreur);
  check(
    !(mis.json ?? []).some((m) => m.order_id === B || m.id === B),
    'B2 Le livreur ne voit pas une commande à emporter',
  );
  check(
    (await rpc('set_order_status', T.resto, { p_order_id: B, p_status: 'ready' })).status < 300,
    'B3 Restaurant : commande prête',
  );
  const code = (await getOrder(T.client, B))?.pickup_code;
  const bad = await rpc('set_order_status', T.resto, {
    p_order_id: B,
    p_status: 'collected',
    p_pickup_code: 'ZZZZ',
  });
  check(bad.status >= 400, 'B3 Retrait avec un mauvais code : refusé', `HTTP ${bad.status}`);
  const good = await rpc('set_order_status', T.resto, {
    p_order_id: B,
    p_status: 'collected',
    p_pickup_code: code,
  });
  check(good.status < 300, 'B3 Retrait avec le bon code', `HTTP ${good.status}`);
  check(
    (await getOrder(T.client, B))?.status === 'collected',
    'B4 Client : commande terminée (collectée)',
  );
}

// ── C. Annulation par le client ────────────────────────────────────────────────────────────────────────────────────
out('\n## C. Annulation par le client');
const c = await fn('create-order', T.client, {
  merchantId: SAMIR,
  items: lines,
  mealPayment: 'card',
});
const C = c.json?.orderId;
check(!!C, 'C1 Client : crée une commande', `HTTP ${c.status}`);
if (C) {
  const stranger = await fn('customer-cancel-order', T.client2, { orderId: C });
  check(
    stranger.status === 404,
    'C2 Un autre client ne peut pas l’annuler',
    `HTTP ${stranger.status}`,
  );
  const cancel = await fn('customer-cancel-order', T.client, { orderId: C });
  check(
    cancel.status === 200 && cancel.json?.status === 'cancelled',
    'C2 Client : annule avant acceptation',
    `HTTP ${cancel.status}`,
  );
  const again = await fn('customer-cancel-order', T.client, { orderId: C });
  check(
    again.status === 409,
    'C3 Seconde annulation : refusée proprement (409)',
    `HTTP ${again.status}`,
  );
  const late = await fn('order-decision', T.resto, {
    orderId: C,
    decision: 'accept',
    prepMinutes: 10,
  });
  check(
    late.status >= 400,
    'C3 Le restaurant ne peut plus accepter une commande annulée',
    `HTTP ${late.status}`,
  );
}
// annulation APRÈS acceptation : interdite au client
const c2 = await fn('create-order', T.client, {
  merchantId: SAMIR,
  items: lines,
  mealPayment: 'card',
});
const C2 = c2.json?.orderId;
if (C2) {
  await fn('order-decision', T.resto, { orderId: C2, decision: 'accept', prepMinutes: 10 });
  const r = await fn('customer-cancel-order', T.client, { orderId: C2 });
  check(r.status === 409, 'C4 Annulation après acceptation : refusée (409)', `HTTP ${r.status}`);
}

// ── D. Refus par le restaurant ─────────────────────────────────────────────────────────────────────────────────────
out('\n## D. Refus par le restaurant');
const d = await fn('create-order', T.client, {
  merchantId: SAMIR,
  items: lines,
  mealPayment: 'card',
});
const D = d.json?.orderId;
if (D) {
  const noOwner = await fn('order-decision', T.resto2, {
    orderId: D,
    decision: 'refuse',
    reason: 'test',
  });
  check(
    noOwner.status >= 400,
    'D1 Un autre restaurant ne peut pas décider',
    `HTTP ${noOwner.status}`,
  );
  const refuse = await fn('order-decision', T.resto, {
    orderId: D,
    decision: 'refuse',
    reason: 'Rupture de stock',
  });
  check(
    refuse.status === 200,
    'D2 Restaurant : refuse avec motif',
    `HTTP ${refuse.status} ${refuse.json?.error ?? ''}`,
  );
  const o = await getOrder(T.client, D);
  check(
    o?.status === 'refused' && /Rupture/.test(o?.refusal_reason ?? ''),
    'D2 Client : voit le refus et son motif',
    `${o?.status}`,
  );
}

// ── E. Cas d'erreur et sécurité ────────────────────────────────────────────────────────────────────────────────────
out('\n## E. Cas d’erreur');
check(
  (await fn('create-order', null, { merchantId: SAMIR, items: lines })).status === 401,
  'E1 create-order sans jeton : 401',
);
check(
  (await fn('create-order', T.client, { merchantId: SAMIR, items: [] })).status >= 400,
  'E2 Panier vide : refusé',
);
check(
  (
    await fn('create-order', T.client, {
      merchantId: SAMIR,
      items: [{ itemId: item.id, quantity: 0 }],
    })
  ).status >= 400,
  'E3 Quantité nulle : refusée',
);
check(
  (
    await fn('create-order', T.client, {
      merchantId: SAMIR,
      items: [{ itemId: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
    })
  ).status >= 400,
  'E4 Article inexistant : refusé',
);
const cheat = await fn('create-order', T.client, {
  merchantId: SAMIR,
  items: [{ itemId: item.id, quantity: 1, expectedTotalCents: 1 }],
});
check(
  cheat.status === 400 && cheat.json?.error === 'price_changed',
  'E5 Prix annoncé falsifié : refusé avec « price_changed » (prix recalculés en base)',
  `HTTP ${cheat.status} ${cheat.json?.error ?? ''}`,
);
check(
  (await fn('create-order', T.resto, { merchantId: SAMIR, items: lines })).status === 403,
  'E6 Un compte restaurant ne peut pas commander (espace verrouillé)',
);
check(
  (await fn('create-order', T.livreur, { merchantId: SAMIR, items: lines })).status === 403,
  'E7 Un compte livreur ne peut pas commander',
);
const far = await fn('create-order', T.client, {
  merchantId: SAMIR,
  items: lines,
  deliveryPayment: 'cash',
  delivery: { ...addr, latitude: 45.76, longitude: 4.83 },
});
check(
  far.status >= 400,
  'E8 Livraison hors zone : refusée',
  `HTTP ${far.status} ${far.json?.error ?? ''}`,
);
await rpc('set_courier_availability', T.livreur, { p_available: false });
const noCourier = await fn('create-order', T.client, {
  merchantId: SAMIR,
  items: lines,
  deliveryPayment: 'cash',
  delivery: addr,
});
check(
  noCourier.status >= 400,
  'E9 Livraison sans livreur disponible : refusée',
  `HTTP ${noCourier.status} ${noCourier.json?.error ?? ''}`,
);
const asClient = await rpc('courier_accept_mission', T.client, { p_order_id: A ?? SAMIR });
check(asClient.status >= 400, 'E10 Un client ne peut pas accepter une mission');
const asResto = await rpc('set_order_status', T.client, {
  p_order_id: A ?? SAMIR,
  p_status: 'ready',
});
check(asResto.status >= 400, 'E11 Un client ne peut pas modifier le statut d’une commande');
await rpc('set_courier_availability', T.livreur, { p_available: true });

out(`\n# Bilan : ${ok} OK, ${fail} ÉCHEC`);
process.exit(fail ? 1 : 0);
