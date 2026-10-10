// Outils partagés des tests de bout en bout (navigateur réel contre le Supabase local).
const crypto = require('crypto');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8081';
const MAILPIT = 'http://127.0.0.1:54324';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const AUTH_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'}/auth/v1`;

/** Chromium de Playwright, ou celui indiqué par CHROMIUM_PATH. */
const launch = () =>
  chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

/** Requête SQL directe sur la base locale (conteneur Docker de `supabase start`). */
const sql = (query) =>
  execSync(`docker exec supabase_db_zeroo psql -U postgres -tAc "${query}"`).toString().trim();

const step = (message) => console.log('✔', message);

/** Ne garde que les éléments visibles (le web garde les écrans précédents montés). */
const visible = (locator) => locator.filter({ visible: true });

const FUNCTIONS = process.env.E2E_FUNCTIONS_URL ?? 'http://127.0.0.1:54321/functions/v1';
const CONNECT_SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? 'whsec_connect_test';
const PLATFORM_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_platform_test';

/** Envoie un événement Stripe signé (en-tête Stripe-Signature) au webhook. */
let eventCount = 0;
async function webhook(
  type,
  object,
  secret = CONNECT_SECRET,
  id = `evt_test_${Date.now()}_${eventCount++}`,
  account = undefined,
) {
  const payload = JSON.stringify({ id, object: 'event', type, account, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  const res = await fetch(`${FUNCTIONS}/stripe-webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Stripe-Signature': `t=${t},v1=${v1}` },
    body: payload,
  });
  return { status: res.status, body: await res.json(), id };
}

/** Événement d'un compte connecté (paiements des commandes), par défaut « Chez Samir ». */
const connectEvent = (type, object, account = 'acct_demo_chez_samir') =>
  webhook(type, object, CONNECT_SECRET, undefined, account);

function run(name, scenario) {
  scenario()
    .then(() => console.log(`\n${name} : OK`))
    .catch((error) => {
      console.error(`\n${name} : ÉCHEC\n${error.message.split('\n').slice(0, 8).join('\n')}`);
      process.exit(1);
    });
}

module.exports = {
  ANON,
  AUTH_URL,
  BASE,
  CONNECT_SECRET,
  connectEvent,
  FUNCTIONS,
  MAILPIT,
  PLATFORM_SECRET,
  launch,
  run,
  sql,
  step,
  visible,
  webhook,
};
