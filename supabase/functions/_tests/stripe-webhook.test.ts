// Tests de la fonction `stripe-webhook` : signature, synchronisation des abonnements, idempotence.
// Lancer : deno test -A supabase/functions/_tests/
import { assertEquals } from 'jsr:@std/assert@1';

import { handler } from '../stripe-webhook/handler.ts';
import { FakeDb, FakeStripe } from './fakes.ts';

const SECRET = 'whsec_test_secret';

async function sign(payload: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${timestamp},v1=${hex}`;
}

type Ctx = {
  db: FakeDb;
  stripe: FakeStripe;
  send: (event: unknown, signature?: string | null) => Promise<Response>;
};

function scenario(name: string, fn: (ctx: Ctx) => Promise<void>, env: Record<string, string | null> = {}) {
  Deno.test(name, async () => {
    const stripe = new FakeStripe().start();
    const db = new FakeDb().start();
    const values: Record<string, string | null> = {
      SUPABASE_URL: `http://localhost:${db.port}`,
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      STRIPE_SECRET_KEY: 'sk_test_fake',
      STRIPE_API_BASE: `http://localhost:${stripe.port}`,
      STRIPE_WEBHOOK_SECRET: SECRET,
      STRIPE_PRICE_PRO_MONTH: 'price_m_pro_month',
      STRIPE_PRICE_PRO_YEAR: 'price_m_pro_year',
      STRIPE_PRICE_COURIER_PRO_MONTH: 'price_c_pro_month',
      STRIPE_PRICE_COURIER_PRO_YEAR: 'price_c_pro_year',
      ...env,
    };
    const before = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(values)) {
      before.set(key, Deno.env.get(key));
      if (value === null) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
    db.rows('subscriptions').push({ merchant_id: 'm1', stripe_customer_id: 'cus_m', status: 'incomplete', trial_used: false, plan: 'start' });
    db.rows('courier_subscriptions').push({ courier_id: 'c1', stripe_customer_id: 'cus_c', status: 'incomplete', trial_used: false, plan: 'start' });
    try {
      await fn({
        db,
        stripe,
        send: async (event, signature) => {
          const payload = JSON.stringify(event);
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          const sig = signature === undefined ? await sign(payload) : signature;
          if (sig !== null) headers['Stripe-Signature'] = sig;
          return handler(new Request('http://localhost/stripe-webhook', { method: 'POST', headers, body: payload }));
        },
      });
    } finally {
      for (const [key, previous] of before) {
        if (previous === undefined) Deno.env.delete(key);
        else Deno.env.set(key, previous);
      }
      await db.stop();
      await stripe.stop();
    }
  });
}

const subscription = (over: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  object: 'subscription',
  customer: 'cus_m',
  status: 'active',
  cancel_at_period_end: false,
  trial_end: null,
  metadata: {},
  items: { object: 'list', data: [{ id: 'si_1', price: { id: 'price_m_start_month' }, current_period_end: 1893456000 }] },
  ...over,
});

const event = (type: string, object: unknown, id = 'evt_1') => ({
  id,
  object: 'event',
  type,
  data: { object },
});

// --- Signature ----------------------------------------------------------------------------------

scenario('sans en-tête de signature : 400, rien enregistré', async ({ send, db }) => {
  const res = await send(event('customer.subscription.updated', subscription()), null);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'invalid_signature');
  assertEquals(db.writes.length, 0);
});

scenario('signature avec un mauvais secret : 400, abonnement inchangé', async ({ send, db }) => {
  const evt = event('customer.subscription.updated', subscription());
  const res = await send(evt, await sign(JSON.stringify(evt), 'whsec_autre'));
  assertEquals(res.status, 400);
  assertEquals(db.rows('subscriptions')[0].status, 'incomplete');
  assertEquals(db.rows('stripe_events').length, 0);
});

scenario('corps modifié après signature : 400', async ({ send, db }) => {
  const signed = event('customer.subscription.updated', subscription({ status: 'incomplete' }));
  const signature = await sign(JSON.stringify(signed));
  const res = await send(event('customer.subscription.updated', subscription({ status: 'active' })), signature);
  assertEquals(res.status, 400);
  assertEquals(db.rows('subscriptions')[0].status, 'incomplete');
});

scenario('signature trop ancienne (rejeu) : 400', async ({ send, db }) => {
  const evt = event('customer.subscription.updated', subscription());
  const old = Math.floor(Date.now() / 1000) - 3600;
  const res = await send(evt, await sign(JSON.stringify(evt), SECRET, old));
  assertEquals(res.status, 400);
  assertEquals(db.rows('subscriptions')[0].status, 'incomplete');
});

scenario('secret du webhook non configuré : toute signature est refusée', async ({ send, db }) => {
  const res = await send(event('customer.subscription.updated', subscription()));
  assertEquals(res.status, 400);
  assertEquals(db.rows('subscriptions')[0].status, 'incomplete');
}, { STRIPE_WEBHOOK_SECRET: null });

// --- Synchronisation de l'abonnement ------------------------------------------------------------

scenario('abonnement restaurant actif : statut, période, formule Start', async ({ send, db }) => {
  const res = await send(event('customer.subscription.updated', subscription()));
  assertEquals(res.status, 200);
  const row = db.rows('subscriptions')[0];
  assertEquals(row.status, 'active');
  assertEquals(row.stripe_subscription_id, 'sub_1');
  assertEquals(row.plan, 'start');
  assertEquals(row.current_period_end, '2030-01-01T00:00:00.000Z');
  assertEquals(row.cancel_at_period_end, false);
  assertEquals(row.trial_used, false);
  // Les livreurs ne sont pas touchés.
  assertEquals(db.rows('courier_subscriptions')[0].status, 'incomplete');
});

for (const [priceId, expected] of [
  ['price_m_pro_month', 'pro'],
  ['price_m_pro_year', 'pro'],
  ['price_m_start_month', 'start'],
  ['price_m_start_year', 'start'],
  ['price_inconnu', 'start'],
] as const) {
  scenario(`restaurant : prix ${priceId} → formule ${expected}`, async ({ send, db }) => {
    const sub = subscription({ items: { data: [{ id: 'si', price: { id: priceId }, current_period_end: 1893456000 }] } });
    await send(event('customer.subscription.updated', sub));
    assertEquals(db.rows('subscriptions')[0].plan, expected);
  });
}

for (const [priceId, expected] of [
  ['price_c_pro_month', 'pro'],
  ['price_c_pro_year', 'pro'],
  ['price_c_start_month', 'start'],
  // Un prix Pro de restaurant ne donne jamais le Pro livreur.
  ['price_m_pro_month', 'start'],
] as const) {
  scenario(`livreur : prix ${priceId} → formule ${expected}`, async ({ send, db }) => {
    const sub = subscription({ customer: 'cus_c', items: { data: [{ id: 'si', price: { id: priceId }, current_period_end: 1893456000 }] } });
    await send(event('customer.subscription.updated', sub));
    assertEquals(db.rows('courier_subscriptions')[0].plan, expected);
    assertEquals(db.rows('subscriptions')[0].status, 'incomplete');
  });
}

scenario('sans prix Pro configurés : la formule vient des métadonnées', async ({ send, db }) => {
  await send(event('customer.subscription.updated', subscription({ metadata: { plan: 'pro' } })));
  assertEquals(db.rows('subscriptions')[0].plan, 'pro');
}, { STRIPE_PRICE_PRO_MONTH: null, STRIPE_PRICE_PRO_YEAR: null });

scenario('essai en cours : trial_used passe à vrai et ne revient jamais à faux', async ({ send, db }) => {
  const trialEnd = 1893456000;
  await send(event('customer.subscription.created', subscription({ status: 'trialing', trial_end: trialEnd }), 'evt_a'));
  let row = db.rows('subscriptions')[0];
  assertEquals(row.status, 'trialing');
  assertEquals(row.trial_end, '2030-01-01T00:00:00.000Z');
  assertEquals(row.trial_used, true);
  await send(event('customer.subscription.updated', subscription({ status: 'active', trial_end: null }), 'evt_b'));
  row = db.rows('subscriptions')[0];
  assertEquals(row.status, 'active');
  assertEquals(row.trial_used, true);
});

for (const status of ['past_due', 'unpaid', 'canceled', 'incomplete']) {
  scenario(`statut ${status} reporté tel quel (droits suspendus par la base)`, async ({ send, db }) => {
    await send(event('customer.subscription.updated', subscription({ status })));
    assertEquals(db.rows('subscriptions')[0].status, status);
  });
}

scenario('résiliation en fin de période reportée', async ({ send, db }) => {
  await send(event('customer.subscription.updated', subscription({ cancel_at_period_end: true })));
  assertEquals(db.rows('subscriptions')[0].cancel_at_period_end, true);
});

scenario('suppression de l’abonnement : statut canceled, données conservées', async ({ send, db }) => {
  await send(event('customer.subscription.updated', subscription(), 'evt_a'));
  await send(event('customer.subscription.deleted', subscription({ status: 'canceled' }), 'evt_b'));
  const row = db.rows('subscriptions')[0];
  assertEquals(row.status, 'canceled');
  assertEquals(row.merchant_id, 'm1');
  assertEquals(db.rows('subscriptions').length, 1);
  assertEquals(db.writes.filter((w) => w.method === 'DELETE').length, 0);
});

scenario('client Stripe inconnu : accusé de réception, aucune ligne modifiée', async ({ send, db }) => {
  const res = await send(event('customer.subscription.updated', subscription({ customer: 'cus_inconnu' })));
  assertEquals(res.status, 200);
  assertEquals(db.rows('subscriptions')[0].status, 'incomplete');
  assertEquals(db.rows('courier_subscriptions')[0].status, 'incomplete');
});

// --- Checkout terminé ---------------------------------------------------------------------------

scenario('checkout.session.completed (abonnement) : relit l’abonnement chez Stripe puis le synchronise', async ({ send, db, stripe }) => {
  stripe.addSubscription('sub_9', 'trialing', 'price_m_pro_month', 'cus_m');
  const res = await send(event('checkout.session.completed', { id: 'cs_1', object: 'checkout.session', mode: 'subscription', subscription: 'sub_9' }));
  assertEquals(res.status, 200);
  assertEquals(stripe.calls('GET', '/v1/subscriptions/sub_9').length, 1);
  const row = db.rows('subscriptions')[0];
  assertEquals(row.status, 'trialing');
  assertEquals(row.plan, 'pro');
  assertEquals(row.stripe_subscription_id, 'sub_9');
});

scenario('checkout.session.completed hors abonnement : ignoré', async ({ send, db, stripe }) => {
  const res = await send(event('checkout.session.completed', { id: 'cs_2', object: 'checkout.session', mode: 'payment', subscription: null }));
  assertEquals(res.status, 200);
  assertEquals(stripe.requests.length, 0);
  assertEquals(db.rows('subscriptions')[0].status, 'incomplete');
});

// --- Idempotence et reprise ---------------------------------------------------------------------

scenario('événement rejoué : accusé « duplicate », aucune seconde écriture', async ({ send, db }) => {
  const evt = event('customer.subscription.updated', subscription(), 'evt_dup');
  assertEquals((await (await send(evt)).json()).received, true);
  const writesAfterFirst = db.writes.length;
  const second = await send(evt);
  assertEquals(second.status, 200);
  assertEquals((await second.json()).duplicate, true);
  assertEquals(db.writes.length, writesAfterFirst);
  assertEquals(db.rows('stripe_events').length, 1);
});

scenario('un rejeu ne ressuscite pas un abonnement résilié depuis', async ({ send, db }) => {
  const first = event('customer.subscription.updated', subscription({ status: 'active' }), 'evt_old');
  await send(first);
  await send(event('customer.subscription.deleted', subscription({ status: 'canceled' }), 'evt_new'));
  await send(first);
  assertEquals(db.rows('subscriptions')[0].status, 'canceled');
});

scenario('événement non utilisé : accusé de réception et enregistré', async ({ send, db }) => {
  const res = await send(event('invoice.paid', { id: 'in_1', object: 'invoice' }, 'evt_inv'));
  assertEquals(res.status, 200);
  assertEquals(db.rows('stripe_events')[0].id, 'evt_inv');
  assertEquals(db.rows('subscriptions')[0].status, 'incomplete');
});

scenario('échec d’écriture : 500 et événement non enregistré (Stripe le renverra)', async ({ send, db }) => {
  db.failWrites.add('subscriptions');
  const res = await send(event('customer.subscription.updated', subscription(), 'evt_fail'));
  assertEquals(res.status, 500);
  assertEquals(db.rows('stripe_events').length, 0);
  // Après réparation, le renvoi de Stripe aboutit.
  db.failWrites.delete('subscriptions');
  const retry = await send(event('customer.subscription.updated', subscription(), 'evt_fail'));
  assertEquals(retry.status, 200);
  assertEquals(db.rows('subscriptions')[0].status, 'active');
  assertEquals(db.rows('stripe_events').length, 1);
});
