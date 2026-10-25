// Tests de la fonction `billing` : les vraies fonctions tournent contre un faux Stripe et une fausse base.
// Lancer : deno test -A supabase/functions/_tests/
import { assert, assertEquals } from 'jsr:@std/assert@1';

import { handler } from '../billing/handler.ts';
import { FakeDb, FakeStripe } from './fakes.ts';

const PRICES = {
  STRIPE_PRICE_START_MONTH: 'price_m_start_month',
  STRIPE_PRICE_START_YEAR: 'price_m_start_year',
  STRIPE_PRICE_PRO_MONTH: 'price_m_pro_month',
  STRIPE_PRICE_PRO_YEAR: 'price_m_pro_year',
  STRIPE_PRICE_COURIER_START_MONTH: 'price_c_start_month',
  STRIPE_PRICE_COURIER_START_YEAR: 'price_c_start_year',
  STRIPE_PRICE_COURIER_PRO_MONTH: 'price_c_pro_month',
  STRIPE_PRICE_COURIER_PRO_YEAR: 'price_c_pro_year',
};

async function scenario(
  name: string,
  fn: (ctx: {
    db: FakeDb;
    stripe: FakeStripe;
    call: (body: unknown, token?: string) => Promise<Response>;
  }) => Promise<void>,
  env: Record<string, string | null> = {},
) {
  Deno.test(name, async () => {
    const stripe = new FakeStripe().start();
    const db = new FakeDb().start();
    const values: Record<string, string | null> = {
      SUPABASE_URL: `http://localhost:${db.port}`,
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      STRIPE_SECRET_KEY: 'sk_test_fake',
      STRIPE_API_BASE: `http://localhost:${stripe.port}`,
      STRIPE_TAX_RATE_ID: 'txr_20',
      APP_WEB_URL: 'https://app.zeeroo.fr',
      ...PRICES,
      ...env,
    };
    const before = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(values)) {
      before.set(key, Deno.env.get(key));
      if (value === null) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
    db.users['t1'] = { id: 'u1', email: 'samir@example.test' };
    db.rows('profiles').push(
      { id: 'u1', account_space: 'merchant' },
      { id: 'u2', account_space: 'courier' },
    );
    db.users['t2'] = { id: 'u2', email: 'courier@example.test' };
    db.rows('merchants').push({ id: 'm1', name: 'Chez Samir', slug: 'chez-samir', owner_id: 'u1' });
    db.rows('couriers').push({ id: 'c1', display_name: 'Karim', user_id: 'u2' });
    try {
      await fn({
        db,
        stripe,
        call: (body, token = (body as { role?: string })?.role === 'courier' ? 't2' : 't1') =>
          handler(
            new Request('http://localhost/billing', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify(body),
            }),
          ),
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

const subscriptionRow = (over: Record<string, unknown> = {}) => ({
  merchant_id: 'm1',
  stripe_customer_id: 'cus_1',
  status: 'incomplete',
  trial_used: false,
  stripe_subscription_id: null,
  ...over,
});

// --- Accès --------------------------------------------------------------------------------------

scenario('refuse une requête sans jeton', async ({ call, stripe }) => {
  const res = await call({ action: 'checkout' }, '');
  assertEquals(res.status, 401);
  assertEquals(stripe.requests.length, 0);
});

scenario('refuse un jeton inconnu', async ({ call, stripe }) => {
  const res = await call({ action: 'checkout' }, 'inconnu');
  assertEquals(res.status, 401);
  assertEquals(stripe.requests.length, 0);
});

scenario(
  'refuse une formule ou une périodicité inconnue avant tout appel Stripe',
  async ({ call, stripe }) => {
    assertEquals((await call({ action: 'checkout', plan: 'gold' })).status, 400);
    assertEquals((await call({ action: 'checkout', interval: 'week' })).status, 400);
    assertEquals(stripe.requests.length, 0);
  },
);

scenario('refuse un utilisateur sans commerce', async ({ call, db }) => {
  db.tables['merchants'] = [];
  const res = await call({ action: 'checkout' });
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error, 'merchant_not_found');
});

// --- Checkout : première souscription ----------------------------------------------------------

scenario(
  'première souscription : client Stripe, ligne en base, essai de 30 jours, TVA, code promo',
  async ({ call, db, stripe }) => {
    const res = await call({ action: 'checkout' });
    assertEquals(res.status, 200);
    assertEquals((await res.json()).url, 'https://checkout.stripe.test/cs_1');

    assertEquals(stripe.calls('POST', '/v1/customers').length, 1);
    const row = db.rows('subscriptions')[0];
    assertEquals(row.merchant_id, 'm1');
    assertEquals(row.stripe_customer_id, 'cus_new');
    assertEquals(row.status, 'incomplete');

    const [session] = stripe.calls('POST', '/v1/checkout/sessions');
    const b = session.body as Record<string, any>;
    assertEquals(b.mode, 'subscription');
    assertEquals(b.customer, 'cus_new');
    assertEquals(b.line_items[0].price, 'price_m_start_month');
    assertEquals(b.subscription_data.trial_period_days, '30');
    assertEquals(b.subscription_data.default_tax_rates[0], 'txr_20');
    assertEquals(b.subscription_data.metadata.plan, 'start');
    assertEquals(b.subscription_data.metadata.interval, 'month');
    assertEquals(b.allow_promotion_codes, 'true');
    assertEquals(b.billing_address_collection, 'required');
    assertEquals(b.success_url, 'https://app.zeeroo.fr/pro/stripe?subscribed=1');
    assertEquals(b.cancel_url, 'https://app.zeeroo.fr/pro/shop');
  },
);

scenario('essai déjà consommé : pas de second essai gratuit', async ({ call, db, stripe }) => {
  db.rows('subscriptions').push(subscriptionRow({ status: 'canceled', trial_used: true }));
  const res = await call({ action: 'checkout' });
  assertEquals(res.status, 200);
  const b = stripe.calls('POST', '/v1/checkout/sessions')[0].body as Record<string, any>;
  assertEquals(b.subscription_data.trial_period_days, undefined);
  assertEquals(stripe.calls('POST', '/v1/customers').length, 0);
});

scenario(
  'sans taux de TVA configuré, la session est créée sans taux',
  async ({ call, stripe }) => {
    const res = await call({ action: 'checkout' });
    assertEquals(res.status, 200);
    const b = stripe.calls('POST', '/v1/checkout/sessions')[0].body as Record<string, any>;
    assertEquals(b.subscription_data.default_tax_rates, undefined);
  },
  { STRIPE_TAX_RATE_ID: null },
);

// --- Prix choisis -------------------------------------------------------------------------------

for (const [plan, interval, expected] of [
  ['start', 'month', 'price_m_start_month'],
  ['start', 'year', 'price_m_start_year'],
  ['pro', 'month', 'price_m_pro_month'],
  ['pro', 'year', 'price_m_pro_year'],
] as const) {
  scenario(`restaurant ${plan}/${interval} : prix ${expected}`, async ({ call, stripe }) => {
    assertEquals((await call({ action: 'checkout', plan, interval })).status, 200);
    const b = stripe.calls('POST', '/v1/checkout/sessions')[0].body as Record<string, any>;
    assertEquals(b.line_items[0].price, expected);
    assertEquals(b.subscription_data.metadata.plan, plan);
    assertEquals(b.subscription_data.metadata.interval, interval);
  });
}

for (const [plan, interval, expected] of [
  ['start', 'month', 'price_c_start_month'],
  ['start', 'year', 'price_c_start_year'],
  ['pro', 'month', 'price_c_pro_month'],
  ['pro', 'year', 'price_c_pro_year'],
] as const) {
  scenario(`livreur ${plan}/${interval} : prix ${expected}`, async ({ call, db, stripe }) => {
    assertEquals((await call({ action: 'checkout', role: 'courier', plan, interval })).status, 200);
    const b = stripe.calls('POST', '/v1/checkout/sessions')[0].body as Record<string, any>;
    assertEquals(b.line_items[0].price, expected);
    assertEquals(db.rows('courier_subscriptions')[0].courier_id, 'c1');
    assertEquals(db.rows('subscriptions').length, 0);
    assertEquals(b.success_url, 'https://app.zeeroo.fr/livreur/compte?subscribed=1');
  });
}

scenario(
  'livreur Start : anciens noms de variables acceptés',
  async ({ call, stripe }) => {
    assertEquals((await call({ action: 'checkout', role: 'courier' })).status, 200);
    const b = stripe.calls('POST', '/v1/checkout/sessions')[0].body as Record<string, any>;
    assertEquals(b.line_items[0].price, 'price_legacy_courier_month');
  },
  {
    STRIPE_PRICE_COURIER_START_MONTH: null,
    STRIPE_PRICE_COURIER_MONTH: 'price_legacy_courier_month',
  },
);

scenario(
  'prix Pro absent de la configuration : erreur, aucune session créée',
  async ({ call, stripe }) => {
    const res = await call({ action: 'checkout', plan: 'pro', interval: 'month' });
    assertEquals(res.status, 500);
    assertEquals(stripe.calls('POST', '/v1/checkout/sessions').length, 0);
  },
  { STRIPE_PRICE_PRO_MONTH: null },
);

// --- Anti-doublon -------------------------------------------------------------------------------

for (const status of ['trialing', 'active']) {
  scenario(`déjà abonné (${status}) : refusé sans appeler Stripe`, async ({ call, db, stripe }) => {
    db.rows('subscriptions').push(subscriptionRow({ status }));
    const res = await call({ action: 'checkout' });
    assertEquals(res.status, 409);
    assertEquals((await res.json()).error, 'already_subscribed');
    assertEquals(stripe.requests.length, 0);
  });
}

for (const status of ['past_due', 'unpaid', 'incomplete', 'paused', 'trialing', 'active']) {
  scenario(
    `webhook en retard : Stripe a déjà un abonnement ${status} : refusé`,
    async ({ call, db, stripe }) => {
      db.rows('subscriptions').push(subscriptionRow({ status: 'incomplete' }));
      stripe.addSubscription('sub_1', status, 'price_m_start_month', 'cus_1');
      const res = await call({ action: 'checkout' });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error, 'already_subscribed');
      assertEquals(stripe.calls('POST', '/v1/checkout/sessions').length, 0);
    },
  );
}

scenario(
  'seuls des abonnements résiliés côté Stripe : nouvelle souscription autorisée',
  async ({ call, db, stripe }) => {
    db.rows('subscriptions').push(subscriptionRow({ status: 'canceled', trial_used: true }));
    stripe.addSubscription('sub_old', 'canceled', 'price_m_start_month', 'cus_1');
    stripe.addSubscription('sub_old2', 'incomplete_expired', 'price_m_start_month', 'cus_1');
    const res = await call({ action: 'checkout' });
    assertEquals(res.status, 200);
    assertEquals(stripe.calls('POST', '/v1/checkout/sessions').length, 1);
  },
);

scenario("l'abonnement d'un autre client Stripe ne bloque pas", async ({ call, db, stripe }) => {
  db.rows('subscriptions').push(subscriptionRow());
  stripe.addSubscription('sub_other', 'active', 'price_m_start_month', 'cus_autre');
  assertEquals((await call({ action: 'checkout' })).status, 200);
});

// --- Changement de formule ----------------------------------------------------------------------

scenario(
  "changement de formule : l'abonnement existant est modifié, jamais un second",
  async ({ call, db, stripe }) => {
    db.rows('subscriptions').push(
      subscriptionRow({ status: 'active', stripe_subscription_id: 'sub_1' }),
    );
    stripe.addSubscription('sub_1', 'active', 'price_m_start_month', 'cus_1');
    const res = await call({ action: 'change', plan: 'pro', interval: 'month' });
    assertEquals(res.status, 200);
    assertEquals((await res.json()).ok, true);

    assertEquals(stripe.calls('POST', '/v1/checkout/sessions').length, 0);
    assertEquals(stripe.calls('POST', '/v1/customers').length, 0);
    const [update] = stripe.calls('POST', '/v1/subscriptions/sub_1');
    const b = update.body as Record<string, any>;
    assertEquals(b.items[0].id, 'si_sub_1');
    assertEquals(b.items[0].price, 'price_m_pro_month');
    assertEquals(b.proration_behavior, 'create_prorations');
    assertEquals(b.cancel_at_period_end, 'false');
    assertEquals(b.metadata.plan, 'pro');
  },
);

scenario('changement vers la même formule : refusé', async ({ call, db, stripe }) => {
  db.rows('subscriptions').push(
    subscriptionRow({ status: 'active', stripe_subscription_id: 'sub_1' }),
  );
  stripe.addSubscription('sub_1', 'active', 'price_m_pro_year', 'cus_1');
  const res = await call({ action: 'change', plan: 'pro', interval: 'year' });
  assertEquals(res.status, 409);
  assertEquals((await res.json()).error, 'plan_unchanged');
  assertEquals(stripe.calls('POST', '/v1/subscriptions/sub_1').length, 0);
});

for (const status of ['incomplete', 'past_due', 'unpaid', 'canceled']) {
  scenario(`changement refusé si l'abonnement est ${status}`, async ({ call, db, stripe }) => {
    db.rows('subscriptions').push(subscriptionRow({ status, stripe_subscription_id: 'sub_1' }));
    const res = await call({ action: 'change', plan: 'pro' });
    assertEquals(res.status, 409);
    assertEquals((await res.json()).error, 'no_active_subscription');
    assertEquals(stripe.requests.length, 0);
  });
}

scenario('changement sans abonnement : refusé', async ({ call }) => {
  const res = await call({ action: 'change', plan: 'pro' });
  assertEquals(res.status, 409);
});

scenario('changement pour un livreur : prix livreur', async ({ call, db, stripe }) => {
  db.rows('courier_subscriptions').push({
    courier_id: 'c1',
    stripe_customer_id: 'cus_c',
    status: 'trialing',
    trial_used: true,
    stripe_subscription_id: 'sub_c',
  });
  stripe.addSubscription('sub_c', 'trialing', 'price_c_start_month', 'cus_c');
  assertEquals((await call({ action: 'change', role: 'courier', plan: 'pro' })).status, 200);
  const b = stripe.calls('POST', '/v1/subscriptions/sub_c')[0].body as Record<string, any>;
  assertEquals(b.items[0].price, 'price_c_pro_month');
});

// --- Portail ------------------------------------------------------------------------------------

scenario(
  'portail : session pour le client Stripe du professionnel',
  async ({ call, db, stripe }) => {
    db.rows('subscriptions').push(subscriptionRow({ status: 'active' }));
    const res = await call({ action: 'portal' });
    assertEquals(res.status, 200);
    assertEquals((await res.json()).url, 'https://portal.stripe.test/bps_1');
    const b = stripe.calls('POST', '/v1/billing_portal/sessions')[0].body as Record<string, any>;
    assertEquals(b.customer, 'cus_1');
    assertEquals(b.return_url, 'https://app.zeeroo.fr/pro/shop');
  },
);

scenario('portail sans abonnement : 404', async ({ call, stripe }) => {
  const res = await call({ action: 'portal' });
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error, 'no_subscription');
  assertEquals(stripe.requests.length, 0);
});

scenario(
  "un professionnel ne voit que sa propre ligne d'abonnement",
  async ({ call, db, stripe }) => {
    db.rows('subscriptions').push(
      subscriptionRow({
        merchant_id: 'm_autre',
        stripe_customer_id: 'cus_autre',
        status: 'active',
      }),
    );
    const res = await call({ action: 'portal' });
    assertEquals(res.status, 404);
    assert(stripe.calls('POST', '/v1/billing_portal/sessions').length === 0);
  },
);

scenario(
  'un compte restaurant ne peut pas demander la facturation livreur',
  async ({ call, stripe }) => {
    const res = await call({ action: 'checkout', role: 'courier' }, 't1');
    assertEquals(res.status, 403);
    assertEquals(stripe.requests.length, 0);
  },
);
scenario(
  'un compte livreur ne peut pas demander la facturation restaurant',
  async ({ call, stripe }) => {
    const res = await call({ action: 'checkout', role: 'merchant' }, 't2');
    assertEquals(res.status, 403);
    assertEquals(stripe.requests.length, 0);
  },
);
