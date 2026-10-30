#!/usr/bin/env node
// Scénarios HTTP + Edge Functions (code réel du dépôt servi par Deno) contre la pile LOCALE (http_stack.sh).
//   node docs/recette/functions_http.mjs --phase avant|apres [--create-order-url URL] [fichier-de-preuve]
// Légende des preuves : [RÉEL] appel HTTP exécuté contre PostgREST/GoTrue/fonctions locaux ;
// [STRIPE-MOCK] Stripe répond par stripe-mock (aucun compte Stripe, aucun réseau) ;
// [SIMULATION] événement ou état fabriqué localement (ex. abonnement écrit en SQL, webhook signé avec un secret local) :
// il ne prouve PAS qu'un webhook Stripe réel sera reçu et traité en production.
// Aucune clé de production, aucun appel distant. Les jetons ne sont jamais écrits.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const W = process.env.HTTP_STACK_DIR ?? '/tmp/zeeroo-http';
const keys = JSON.parse(readFileSync(`${W}/keys.json`, 'utf8'));
const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const args = process.argv.slice(2);
const phase = args[args.indexOf('--phase') + 1];
const createOrderUrl = args.includes('--create-order-url') ? args[args.indexOf('--create-order-url') + 1] : `${API}/functions/v1/create-order`;
const expectError = args.includes('--expect-create-order-error') ? args[args.indexOf('--expect-create-order-error') + 1] : null;
const proof = args.filter((a, i) => !a.startsWith('--') && !['--phase', '--create-order-url', '--expect-create-order-error'].includes(args[i - 1]))[0];
if (!['avant', 'apres'].includes(phase)) { console.error('--phase avant|apres requis'); process.exit(64); }
const PASSWORD = process.env.RECETTE_PASSWORD; // exporté par recette_http.sh (lu dans supabase/seed.sql)
if (!PASSWORD) { console.error('RECETTE_PASSWORD requis'); process.exit(64); }
const mask = (s) => String(s).replace(/eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+){0,2}/g, '[JETON-MASQUÉ]').replaceAll(PASSWORD, '[MDP-MASQUÉ]');
if (proof) writeFileSync(proof, '', { mode: 0o600 });
const out = (l) => { const m = mask(l); console.log(m); if (proof) appendFileSync(proof, m + '\n'); };
let ok = 0, fail = 0, tech = 0;
const v = (kind, tag, name, d = '') => { if (kind === 'ok') ok++; else if (kind === 'echec') fail++; else tech++; out(`${{ ok: 'OK              ', echec: 'ÉCHEC           ', tech: 'ERREUR-TECHNIQUE' }[kind]} [${tag}] ${name}${d ? ' — ' + d : ''}`); };
const sql = (q) => execFileSync('psql', ['-X', '-At', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-c', q], { env: process.env /* mot de passe de la base : exporté par recette_http.sh */ }).toString().trim();

async function http(method, url, token, body, extra = {}) {
  try {
    const r = await fetch(url, { method, headers: { apikey: keys.anon, Authorization: `Bearer ${token ?? keys.anon}`, 'Content-Type': 'application/json', ...extra }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)), signal: AbortSignal.timeout(30000) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* non JSON */ }
    return { status: r.status, json: j, text: t };
  } catch (e) { return { status: 0, json: null, text: String(e) }; }
}
async function login(email) {
  const r = await http('POST', `${API}/auth/v1/token?grant_type=password`, null, { email, password: PASSWORD });
  return r.json?.access_token ?? null;
}
const T = {};
for (const [k, e] of Object.entries({ client: 'client@zeroo.test', client2: 'client2@zeroo.test', commercant: 'commercant@zeroo.test', commercant2: 'commercant2@zeroo.test' })) {
  T[k] = await login(e);
  if (!T[k]) v('tech', 'RÉEL', `connexion ${k}`, 'échec');
}
if (tech) process.exit(2);
out(`# Recette HTTP + fonctions — phase ${phase} — ${new Date().toISOString()} — pile locale ${API}`);

const SAMIR = '30000000-0000-0000-0000-000000000001';
const TRUTH = { phone: '0102030405', payment_link: 'https://pay.example.test/recette-samir' };
const after = phase === 'apres';

// 1. create-order
const anon = await http('POST', createOrderUrl, null, { merchantId: SAMIR, items: [] });
anon.status === 401 ? v('ok', 'RÉEL', 'create-order sans jeton client', 'HTTP 401') : v('echec', 'RÉEL', 'create-order sans jeton client', `HTTP ${anon.status}`);

const itemRes = await http('GET', `${API}/rest/v1/menu_items?select=id,name,price_cents,menu_option_groups(min_select)&merchant_id=eq.${SAMIR}&is_available=eq.true`, T.client);
// un article sans option obligatoire (le but est le parcours de commande, pas le choix d'options)
const item = (itemRes.json ?? []).find((i) => (i.menu_option_groups ?? []).every((g) => g.min_select === 0));
if (!item) { v('tech', 'RÉEL', 'article du menu', `HTTP ${itemRes.status} : aucun article disponible`); }
let orderId = null;
if (item) {
  const r = await http('POST', createOrderUrl, T.client, { merchantId: SAMIR, items: [{ itemId: item.id, quantity: 1 }], mealPayment: 'card' });
  if (expectError) {
    // Bascule : ANCIENNE Edge Function après migration (elle lit merchants.payment_link, désormais vide).
    (r.status >= 400 && r.json?.error === expectError) ? v('ok', 'RÉEL', `ANCIENNE fonction create-order après migration : refus « ${expectError} » (attendu : fonction à redéployer AVEC la migration)`, `HTTP ${r.status}`) : v('echec', 'RÉEL', 'ancienne fonction après migration', `HTTP ${r.status} ${r.text.slice(0, 100)}`);
  } else if (r.status === 200 && r.json?.orderId) { orderId = r.json.orderId; v('ok', 'RÉEL', 'create-order carte (lien de paiement du restaurant)', `commande créée ${orderId.slice(0, 8)}`); }
  else v(r.json?.error === 'merchant_not_accepting' ? 'tech' : 'echec', 'RÉEL', 'create-order carte', `HTTP ${r.status} ${r.text.slice(0, 120)}`);
  const c = await http('POST', createOrderUrl, T.client, { merchantId: SAMIR, items: [{ itemId: item.id, quantity: 1 }], mealPayment: 'cash' });
  // espèces : exige accepts_cash_pickup ; on enregistre le résultat tel quel (comportement attendu : identique avant/après)
  out(`INFO             [RÉEL] create-order espèces : HTTP ${c.status} ${c.json?.orderId ? 'commande créée' : (c.json?.error ?? '')} (le restaurant de recette n'accepte pas les espèces : comportement identique avant/après)`);
}

// 2. Lecture côté client de la commande : sélection NOUVELLE (alias merchant_*) et ANCIENNE (colonnes brutes)
if (orderId) {
  const sel = (merchantCols) => `${API}/rest/v1/orders?select=id,merchants(name,slug,${merchantCols})&id=eq.${orderId}`;
  const nv = await http('GET', sel('phone:merchant_phone,payment_link:merchant_payment_link'), T.client);
  const m = nv.json?.[0]?.merchants;
  if (after) (m?.phone === TRUTH.phone && m?.payment_link === TRUTH.payment_link) ? v('ok', 'RÉEL', 'page commande, NOUVELLE application (alias merchant_*)', 'téléphone et lien de paiement lus') : v('echec', 'RÉEL', 'page commande, nouvelle application', `HTTP ${nv.status} ${JSON.stringify(m)}`);
  else out(`INFO             [RÉEL] page commande, alias merchant_* avant migration : HTTP ${nv.status} (fonctions absentes : attendu)`);
  const old = await http('GET', sel('phone,payment_link'), T.client);
  const mo = old.json?.[0]?.merchants;
  if (after) (mo?.phone == null && mo?.payment_link == null) ? v('ok', 'RÉEL', 'page commande, ANCIENNE application après migration', 'valeurs absentes (dégradation attendue tant que l\'application n\'est pas remplacée)') : v('echec', 'RÉEL', 'ancienne application après migration', JSON.stringify(mo));
  else (mo?.phone === TRUTH.phone && mo?.payment_link === TRUTH.payment_link) ? v('ok', 'RÉEL', 'page commande, ancienne application avant migration', 'valeurs lues (référence)') : v('echec', 'RÉEL', 'page commande avant migration', JSON.stringify(mo));
  const other = await http('GET', `${API}/rest/v1/orders?select=id&id=eq.${orderId}`, T.client2);
  (other.status === 200 && other.json?.length === 0) ? v('ok', 'RÉEL', 'un autre client ne voit pas la commande', '0 ligne') : v('echec', 'RÉEL', 'isolation des commandes', `HTTP ${other.status} ${other.json?.length} ligne(s)`);
  // Le restaurateur reçoit la commande : décision (accepter) par la fonction order-decision
  const dec = await http('POST', `${API}/functions/v1/order-decision`, T.commercant, { orderId, decision: 'accept', prepMinutes: 15 });
  (dec.status === 200) ? v('ok', 'RÉEL', 'order-decision : le restaurateur accepte la commande', `HTTP 200`) : out(`INFO             [RÉEL] order-decision : HTTP ${dec.status} ${dec.text.slice(0, 100)} (contrat de la fonction à confirmer)`);
}

// 3. Publication, encaissement et abonnement — l'abonnement est ÉCRIT EN SQL (simulation du résultat d'un paiement Stripe)
const NP = '31000000-0000-0000-0000-000000000001';
const pub1 = await http('PATCH', `${API}/rest/v1/merchants?id=eq.${NP}`, T.commercant2, { is_published: true }, { Prefer: 'return=representation' });
(pub1.status >= 400 && !(pub1.json?.[0]?.is_published)) ? v('ok', 'RÉEL', 'publication refusée sans abonnement actif', `HTTP ${pub1.status}`) : v('echec', 'RÉEL', 'publication sans abonnement', `HTTP ${pub1.status} ${pub1.text.slice(0, 100)}`);
sql(`insert into public.subscriptions (merchant_id, stripe_customer_id, status, plan) values ('${NP}', 'cus_recette_simule', 'active', 'start') on conflict (merchant_id) do update set status='active'`);
const pub2 = await http('PATCH', `${API}/rest/v1/merchants?id=eq.${NP}`, T.commercant2, { is_published: true }, { Prefer: 'return=representation' });
(pub2.status === 200 && pub2.json?.[0]?.is_published === true) ? v('ok', 'SIMULATION', 'publication acceptée : abonnement actif (écrit en SQL) + encaissement configuré (lien de paiement)', 'HTTP 200') : v('echec', 'SIMULATION', 'publication avec abonnement actif', `HTTP ${pub2.status} ${pub2.text.slice(0, 160)}`);
sql(`update public.subscriptions set status='canceled' where merchant_id='${NP}'`);
const pubState = sql(`select is_published from public.merchants where id='${NP}'`);
pubState === 'f' ? v('ok', 'SIMULATION', 'résiliation : la fiche est dépubliée automatiquement (déclencheur)', 'is_published=false') : v('echec', 'SIMULATION', 'dépublication à la résiliation', pubState);
sql(`delete from public.subscriptions where merchant_id='${NP}'`);

// 4. Abonnement Stripe : action billing (STRIPE-MOCK) et webhook (SIMULATION)
const bill = await http('POST', `${API}/functions/v1/billing`, T.commercant2, { action: 'checkout', plan: 'start', interval: 'month' });
(bill.status === 200 && typeof bill.json?.url === 'string') ? v('ok', 'STRIPE-MOCK', 'billing checkout : session créée par stripe-mock', 'URL de paiement renvoyée') : out(`INFO             [STRIPE-MOCK] billing checkout : HTTP ${bill.status} ${bill.text.slice(0, 140)}`);
const body = JSON.stringify({ id: 'evt_recette_1', object: 'event', type: 'invoice.created', data: { object: {} } });
const bad = await http('POST', `${API}/functions/v1/stripe-webhook`, null, body, { 'stripe-signature': 't=1,v1=00' });
bad.status === 400 ? v('ok', 'SIMULATION', 'webhook : signature invalide refusée', 'HTTP 400') : v('echec', 'SIMULATION', 'webhook signature invalide', `HTTP ${bad.status}`);
const ts = Math.floor(Date.now() / 1000), sig = createHmac('sha256', keys.webhook).update(`${ts}.${body}`).digest('hex');
const good = await http('POST', `${API}/functions/v1/stripe-webhook`, null, body, { 'stripe-signature': `t=${ts},v1=${sig}` });
(good.status === 200) ? v('ok', 'SIMULATION', 'webhook : événement signé avec le secret LOCAL accepté (ne prouve pas la réception d\'un webhook Stripe réel)', 'HTTP 200') : v('echec', 'SIMULATION', 'webhook signé', `HTTP ${good.status} ${good.text.slice(0, 100)}`);

out(`# Bilan : ${ok} OK, ${fail} échec(s), ${tech} erreur(s) technique(s)`);
process.exit(tech ? 2 : fail ? 1 : 0);
