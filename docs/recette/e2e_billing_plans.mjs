#!/usr/bin/env node
// Recette des abonnements Start / Pro : droits d'accès par formule, cycle de vie (essai, actif, impayé, résilié, rétrogradation),
// dépublication automatique, livreur Start/Pro, action `billing` (stripe-mock) et webhook (signature, rejeu).
// Pile LOCALE (http_stack.sh + functions_serve.sh), données fictives, Stripe simulé : l'état de l'abonnement est écrit en SQL comme le
// ferait le webhook (la synchronisation webhook → base est couverte par les tests Deno `stripe-webhook.test.ts`).
//   RECETTE_PASSWORD=… node docs/recette/e2e_billing_plans.mjs [fichier-de-preuve]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const W = process.env.HTTP_STACK_DIR ?? '/tmp/zeeroo-http';
const keys = JSON.parse(readFileSync(`${W}/keys.json`, 'utf8'));
const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const PASSWORD = process.env.RECETTE_PASSWORD;
if (!PASSWORD) { console.error('RECETTE_PASSWORD requis'); process.exit(64); }
const proof = process.argv[2];
const mask = (s) => String(s).replace(/eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+){0,2}/g, '[JETON-MASQUÉ]').replaceAll(PASSWORD, '[MDP-MASQUÉ]');
if (proof) writeFileSync(proof, '', { mode: 0o600 });
const out = (l) => { const m = mask(l); console.log(m); if (proof) appendFileSync(proof, m + '\n'); };
let ok = 0, fail = 0;
const check = (cond, name, detail = '') => { cond ? ok++ : fail++; out(`${cond ? 'OK     ' : 'ÉCHEC  '} ${name}${detail ? ' — ' + detail : ''}`); return cond; };
const sql = (q) => execFileSync('psql', ['-X', '-At', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-c', q], { env: process.env }).toString().trim();

async function http(method, url, token, body, extra = {}) {
  try {
    const r = await fetch(url, { method, headers: { apikey: keys.anon, Authorization: `Bearer ${token ?? keys.anon}`, 'Content-Type': 'application/json', ...extra }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* non JSON */ }
    return { status: r.status, json: j, text: t };
  } catch (e) { return { status: 0, json: null, text: String(e) }; }
}
const login = async (email) => (await http('POST', `${API}/auth/v1/token?grant_type=password`, null, { email, password: PASSWORD })).json?.access_token ?? null;
const rpc = (name, token, args = {}) => http('POST', `${API}/rest/v1/rpc/${name}`, token, args);
const fn = (name, token, body) => http('POST', `${API}/functions/v1/${name}`, token, body);
const msg = (r) => r.json?.message ?? r.json?.error ?? '';
const T = {};
for (const [k, e] of Object.entries({ client: 'client@zeroo.test', resto2: 'commercant2@zeroo.test', resto: 'commercant@zeroo.test', livreur: 'livreur@zeroo.test' })) {
  T[k] = await login(e); if (!T[k]) { out(`ERREUR-TECHNIQUE connexion ${k}`); process.exit(2); }
}
out(`# Recette abonnements Start/Pro — ${new Date().toISOString()} — pile locale ${API}`);

const NP = '31000000-0000-0000-0000-000000000001';       // restaurant de recette non publié
const SAMIR = '30000000-0000-0000-0000-000000000001';
const COURIER = '80000000-0000-0000-0000-000000000001';
const setSub = (status, plan) => sql(`insert into public.subscriptions (merchant_id, stripe_customer_id, status, plan) values ('${NP}', 'cus_recette_plans', '${status}', '${plan}') on conflict (merchant_id) do update set status='${status}', plan='${plan}'`);
const published = () => sql(`select is_published from public.merchants where id='${NP}'`) === 't';
const patchNP = (body) => http('PATCH', `${API}/rest/v1/merchants?id=eq.${NP}`, T.resto2, body, { Prefer: 'return=representation' });
sql(`delete from public.subscriptions where merchant_id='${NP}'`);
sql(`update public.merchants set is_published=false, tagline=null, about=null, group_orders_enabled=false where id='${NP}'`);
// encaissement configuré (espèces) : seule la formule manque
const cash = await patchNP({ accepts_cash_pickup: true });
check(cash.status === 200, 'Préparation : le restaurant de recette accepte les espèces', `HTTP ${cash.status}`);

// ── Restaurant ─────────────────────────────────────────────────────────────────────────────────────────────────────
out('\n## Restaurant — droits par formule et cycle de vie');
let r = await patchNP({ is_published: true });
check(r.status >= 400 && !published(), 'M1 Sans abonnement : publication refusée', msg(r));
setSub('trialing', 'start');
r = await patchNP({ is_published: true });
check(r.status === 200 && published(), 'M2 Essai gratuit, formule Start : publication acceptée');
r = await patchNP({ tagline: 'Slogan de test' });
check(r.status >= 400 && msg(r).startsWith('minisite_requires_pro'), 'M3 Start : mini-site (slogan) refusé « minisite_requires_pro »', msg(r));
r = await patchNP({ group_orders_enabled: true });
check(r.status >= 400 && msg(r).startsWith('feature_requires_pro'), 'M3 Start : commandes groupées refusées « feature_requires_pro »', msg(r));
r = await rpc('merchant_advanced_stats', T.resto2, { p_merchant_id: NP });
check(r.status >= 400 && msg(r).startsWith('feature_requires_pro'), 'M3 Start : statistiques avancées refusées', msg(r));
r = await rpc('save_happy_hour', T.resto2, { p_merchant_id: NP, p_id: null, p_data: {} });
check(msg(r).startsWith('feature_requires_pro'), 'M3 Start : Happy Hours refusées « feature_requires_pro »', msg(r));
r = await rpc('merchant_today_summary', T.resto2, { p_merchant_id: NP });
check(r.status === 200, 'M3 Start : synthèse du jour accessible (fonctions de base)');
const hasStart = sql(`select m.has_minisite from public.public_merchants m where m.id='${NP}'`);
check(hasStart === 'f', 'M3 Start : la fiche publique n’a pas de mini-site', hasStart);

setSub('active', 'pro');
r = await patchNP({ tagline: 'Slogan de test', about: 'À propos de test' });
check(r.status === 200, 'M4 Pro actif : mini-site autorisé', msg(r));
r = await patchNP({ group_orders_enabled: true });
check(r.status === 200, 'M4 Pro actif : commandes groupées autorisées', msg(r));
r = await rpc('merchant_advanced_stats', T.resto2, { p_merchant_id: NP });
check(r.status === 200, 'M4 Pro actif : statistiques avancées autorisées', msg(r));
r = await rpc('save_happy_hour', T.resto2, { p_merchant_id: NP, p_id: null, p_data: {} });
check(!msg(r).startsWith('feature_requires_pro'), 'M4 Pro actif : Happy Hours : plus de refus de formule (autre validation éventuelle)', msg(r) || `HTTP ${r.status}`);
const hasPro = sql(`select m.has_minisite from public.public_merchants m where m.id='${NP}'`);
check(hasPro === 't', 'M4 Pro : la fiche publique expose le mini-site', hasPro);

setSub('active', 'start'); // rétrogradation
r = await patchNP({ tagline: 'Nouveau slogan' });
check(r.status >= 400 && msg(r).startsWith('minisite_requires_pro'), 'M5 Rétrogradation Pro → Start : modification du mini-site refusée', msg(r));
check(sql(`select has_minisite from public.public_merchants where id='${NP}'`) === 'f', 'M5 Rétrogradation : le mini-site n’est plus exposé publiquement');
check(published(), 'M5 Rétrogradation : la fiche reste publiée (abonnement toujours actif)');

for (const [status, label] of [['past_due', 'impayé'], ['unpaid', 'impayé (unpaid)'], ['canceled', 'résilié'], ['incomplete_expired', 'paiement initial expiré'], ['paused', 'en pause']]) {
  setSub('active', 'start'); await patchNP({ is_published: true });
  setSub(status, 'start');
  check(!published(), `M6 ${label} : la fiche est dépubliée automatiquement`);
  r = await patchNP({ is_published: true });
  check(r.status >= 400 && !published(), `M6 ${label} : republication refusée`, msg(r));
  const row = sql(`select count(*) from public.public_merchants where id='${NP}'`);
  check(row === '0', `M6 ${label} : absente de l’annuaire public`);
}
setSub('active', 'start');
r = await patchNP({ is_published: true });
check(r.status === 200 && published(), 'M7 Renouvellement / régularisation (retour à « active ») : republication possible par le restaurateur');
setSub('trialing', 'start'); setSub('past_due', 'start');
check(!published(), 'M7 Essai terminé sans paiement (past_due) : dépublié');
const anon = await http('GET', `${API}/rest/v1/subscriptions?select=*`, keys.anon);
check(Array.isArray(anon.json) ? anon.json.length === 0 : anon.status >= 400, 'M8 Les abonnements ne sont pas lisibles par un anonyme');
const other = await http('GET', `${API}/rest/v1/subscriptions?select=merchant_id&merchant_id=eq.${NP}`, T.resto);
check(Array.isArray(other.json) && other.json.length === 0, 'M8 Un autre restaurant ne voit pas cet abonnement');
const write = await http('PATCH', `${API}/rest/v1/subscriptions?merchant_id=eq.${NP}`, T.resto2, { status: 'active', plan: 'pro' }, { Prefer: 'return=representation' });
check(write.status >= 400 || (Array.isArray(write.json) && write.json.length === 0), 'M8 Un restaurateur ne peut pas modifier lui-même son abonnement', `HTTP ${write.status}`);
const ins = await http('POST', `${API}/rest/v1/subscriptions`, T.resto2, { merchant_id: NP, stripe_customer_id: 'cus_x', status: 'active', plan: 'pro' });
check(ins.status >= 400, 'M8 …ni en créer un faux', `HTTP ${ins.status}`);
sql(`delete from public.subscriptions where merchant_id='${NP}'`);
sql(`update public.merchants set is_published=false, tagline=null, about=null, group_orders_enabled=false where id='${NP}'`);

// ── Livreur ────────────────────────────────────────────────────────────────────────────────────────────────────────
out('\n## Livreur — Start / Pro');
const setCSub = (status, plan) => sql(`update public.courier_subscriptions set status='${status}', plan='${plan}' where courier_id='${COURIER}'`);
const lines = await (async () => { const it = (await http('GET', `${API}/rest/v1/menu_items?select=id,menu_option_groups(min_select)&merchant_id=eq.${SAMIR}&is_available=eq.true`, T.client)).json ?? []; return [{ itemId: it.find((i) => (i.menu_option_groups ?? []).every((g) => g.min_select === 0)).id, quantity: 1 }]; })();
const addr = { addressLine: '12 rue de Rivoli', postalCode: '75001', city: 'Paris', latitude: 48.8606, longitude: 2.3376, phone: '0612345678' };
const mk = async () => { const o = await fn('create-order', T.client, { merchantId: SAMIR, items: lines, mealPayment: 'card', deliveryPayment: 'cash', delivery: addr }); const id = o.json?.orderId; if (id) await fn('order-decision', T.resto, { orderId: id, decision: 'accept', prepMinutes: 10 }); return id; };
setCSub('trialing', 'start');
await rpc('set_courier_availability', T.livreur, { p_available: true });
const o1 = await mk(); const o2 = await mk();
check(!!o1 && !!o2, 'C0 Deux livraisons à pourvoir', `${o1 ? 'ok' : 'échec'} / ${o2 ? 'ok' : 'échec'}`);
r = await rpc('courier_accept_mission', T.livreur, { p_order_id: o1 });
check(r.status === 200, 'C1 Livreur Start (essai) : accepte une première course', msg(r));
r = await rpc('courier_accept_mission', T.livreur, { p_order_id: o2 });
check(r.status >= 400 && msg(r).startsWith('courier_at_capacity'), 'C2 Livreur Start : une seconde course simultanée est refusée « courier_at_capacity »', msg(r));
setCSub('trialing', 'pro');
r = await rpc('courier_accept_mission', T.livreur, { p_order_id: o2 });
check(r.status === 200 || msg(r).startsWith('mission_not_compatible'), 'C3 Livreur Pro : plusieurs courses simultanées autorisées (ou refus de groupage « mission_not_compatible »)', msg(r) || 'HTTP 200');
setCSub('canceled', 'pro');
const mis = await rpc('available_missions', T.livreur);
check(Array.isArray(mis.json) && mis.json.length === 0, 'C4 Abonnement livreur résilié : aucune mission proposée');
r = await rpc('courier_accept_mission', T.livreur, { p_order_id: o2 });
check(r.status >= 400 && !r.json?.id, 'C4 Abonnement livreur résilié : acceptation refusée', msg(r));
setCSub('trialing', 'pro');
const cs = await http('GET', `${API}/rest/v1/courier_subscriptions?select=*`, T.client);
check(Array.isArray(cs.json) && cs.json.length === 0, 'C5 Un client ne lit aucun abonnement de livreur');
const cw = await http('PATCH', `${API}/rest/v1/courier_subscriptions?courier_id=eq.${COURIER}`, T.livreur, { plan: 'pro', status: 'active' }, { Prefer: 'return=representation' });
check(cw.status >= 400 || (Array.isArray(cw.json) && cw.json.length === 0), 'C5 Un livreur ne peut pas modifier son propre abonnement', `HTTP ${cw.status}`);
for (const id of [o1, o2]) if (id) sql(`update public.orders set status='cancelled', courier_id=null where id='${id}'`);

// ── Action billing (stripe-mock) ───────────────────────────────────────────────────────────────────────────────────
out('\n## Action billing (Stripe simulé)');
check((await fn('billing', null, { action: 'checkout', plan: 'start', interval: 'month' })).status === 401, 'B1 Sans jeton : 401');
r = await fn('billing', T.resto2, { action: 'checkout', plan: 'start', interval: 'month' });
check(r.status === 200 && typeof r.json?.url === 'string', 'B2 Restaurant : session de paiement Start mensuel créée', `HTTP ${r.status} ${r.json?.error ?? ''}`);
check((await fn('billing', T.resto2, { action: 'checkout', plan: 'start', interval: 'month' })).json?.error === 'already_subscribed', 'B2 Second paiement alors qu’un abonnement existe déjà chez Stripe : refusé « already_subscribed » (anti-doublon)');
for (const [plan, interval] of [['start', 'year'], ['pro', 'month'], ['pro', 'year']]) {
  sql(`delete from public.subscriptions where merchant_id='${NP}'`);
  r = await fn('billing', T.resto2, { action: 'checkout', plan, interval });
  check(r.status === 200 && !!r.json?.url, `B3 Restaurant : ${plan} ${interval === 'year' ? 'annuel' : 'mensuel'} accepté`, `HTTP ${r.status} ${r.json?.error ?? ''}`);
}
r = await fn('billing', T.resto2, { action: 'checkout', plan: 'platinum', interval: 'month' });
check(r.status === 400, 'B4 Formule inconnue : refusée', `${r.status} ${r.json?.error ?? ''}`);
r = await fn('billing', T.resto2, { action: 'checkout', plan: 'start', interval: 'week' });
check(r.status === 400, 'B4 Périodicité inconnue : refusée', `${r.status} ${r.json?.error ?? ''}`);
sql(`delete from public.subscriptions where merchant_id='${NP}'`);
r = await fn('billing', T.resto2, { action: 'portal' });
check(r.status === 404 || r.status === 400, 'B5 Portail client sans abonnement : refusé proprement', `${r.status} ${r.json?.error ?? ''}`);
r = await fn('billing', T.client, { action: 'checkout', plan: 'start', interval: 'month' });
check(r.status >= 400, 'B6 Un compte client ne peut pas souscrire d’abonnement professionnel', `${r.status} ${r.json?.error ?? ''}`);
r = await fn('billing', T.livreur, { action: 'checkout', plan: 'pro', interval: 'month', role: 'courier' });
check(r.status === 200 || r.status === 409, 'B7 Livreur : session de paiement ou « déjà abonné »', `${r.status} ${r.json?.error ?? ''}`);
sql(`delete from public.subscriptions where merchant_id='${NP}'`);

// ── Webhook ────────────────────────────────────────────────────────────────────────────────────────────────────────
out('\n## Webhook Stripe (signature locale)');
const evt = (id, type = 'invoice.created') => JSON.stringify({ id, object: 'event', type, data: { object: {} } });
const signed = (body, secret = keys.webhook, ts = Math.floor(Date.now() / 1000)) => ({ 'stripe-signature': `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}` });
let b = evt('evt_plans_' + Date.now());
check((await http('POST', `${API}/functions/v1/stripe-webhook`, null, b)).status === 400, 'W1 Sans signature : 400');
check((await http('POST', `${API}/functions/v1/stripe-webhook`, null, b, { 'stripe-signature': 't=1,v1=00' })).status === 400, 'W2 Signature invalide : 400');
check((await http('POST', `${API}/functions/v1/stripe-webhook`, null, b, signed(b, 'whsec_autre'))).status === 400, 'W3 Signature d’un autre secret : 400');
check((await http('POST', `${API}/functions/v1/stripe-webhook`, null, b, signed(b, keys.webhook, 1000))).status === 400, 'W4 Signature trop ancienne (rejeu) : 400');
const g1 = await http('POST', `${API}/functions/v1/stripe-webhook`, null, b, signed(b));
check(g1.status === 200 && g1.json?.received === true && !g1.json?.duplicate, 'W5 Événement signé : accepté', `HTTP ${g1.status}`);
const g2 = await http('POST', `${API}/functions/v1/stripe-webhook`, null, b, signed(b));
check(g2.status === 200 && g2.json?.duplicate === true, 'W6 Même événement rejoué : « duplicate », sans second traitement');
const tampered = b.replace('invoice.created', 'customer.subscription.deleted');
check((await http('POST', `${API}/functions/v1/stripe-webhook`, null, tampered, signed(b))).status === 400, 'W7 Corps modifié après signature : 400');
const sub = JSON.stringify({ id: 'evt_plans_sub_' + Date.now(), object: 'event', type: 'customer.subscription.updated', data: { object: { id: 'sub_inconnu', object: 'subscription', customer: 'cus_inexistant', status: 'active', items: { data: [] }, cancel_at_period_end: false, trial_end: null, metadata: {} } } });
const u = await http('POST', `${API}/functions/v1/stripe-webhook`, null, sub, signed(sub));
check(u.status === 200, 'W8 Abonnement d’un client Stripe inconnu : accusé de réception, aucune erreur', `HTTP ${u.status}`);

out(`\n# Bilan : ${ok} OK, ${fail} ÉCHEC`);
process.exit(fail ? 1 : 0);
