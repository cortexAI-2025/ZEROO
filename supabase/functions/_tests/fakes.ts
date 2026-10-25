// Doubles de test pour les fonctions de facturation : un faux Stripe et une fausse base (PostgREST + Auth)
// en mémoire, joints par les vraies fonctions via STRIPE_API_BASE et SUPABASE_URL.
// Aucun appel réseau externe, aucun secret.

export type Row = Record<string, unknown>;
export type Recorded = { method: string; path: string; query: URLSearchParams; body: Row };

/** « a[0][b]=1&a[0][c]=2 » → { a: [{ b: '1', c: '2' }] } (format des corps envoyés par stripe-node). */
export function parseForm(text: string): Row {
  const root: Row = {};
  for (const [rawKey, value] of new URLSearchParams(text)) {
    const keys = rawKey.replace(/\]/g, '').split('[');
    let node: Row = root;
    keys.forEach((key, i) => {
      if (i === keys.length - 1) {
        node[key] = value;
        return;
      }
      if (node[key] === undefined) node[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      node = node[key] as Row;
    });
  }
  return root;
}

const stripeSubscription = (id: string, status: string, priceId: string, customer: string) => ({
  id,
  object: 'subscription',
  customer,
  status,
  cancel_at_period_end: false,
  trial_end: null,
  metadata: {},
  items: {
    object: 'list',
    data: [{ id: `si_${id}`, object: 'subscription_item', price: { id: priceId } }],
  },
});

/** Faux Stripe : enregistre chaque requête et répond avec les abonnements configurés. */
export class FakeStripe {
  requests: Recorded[] = [];
  /** Abonnements renvoyés par `subscriptions.list` et `retrieve`, par identifiant. */
  subscriptions = new Map<string, ReturnType<typeof stripeSubscription>>();
  server!: Deno.HttpServer;
  port = 0;

  start() {
    this.server = Deno.serve({ port: 0, onListen: ({ port }) => (this.port = port) }, (req) =>
      this.handle(req),
    );
    return this;
  }

  async stop() {
    await this.server.shutdown();
  }

  addSubscription(id: string, status: string, priceId: string, customer: string) {
    const subscription = stripeSubscription(id, status, priceId, customer);
    this.subscriptions.set(id, subscription);
    return subscription;
  }

  calls(method: string, path: RegExp | string) {
    return this.requests.filter(
      (r) =>
        r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)),
    );
  }

  private async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const body = req.method === 'POST' ? parseForm(await req.text()) : {};
    this.requests.push({ method: req.method, path: url.pathname, query: url.searchParams, body });
    const reply = (data: unknown) =>
      new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

    if (req.method === 'POST' && url.pathname === '/v1/customers') {
      return reply({ id: 'cus_new', object: 'customer' });
    }
    if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      return reply({ id: 'cs_1', object: 'checkout.session', url: 'https://checkout.stripe.test/cs_1' });
    }
    if (req.method === 'POST' && url.pathname === '/v1/billing_portal/sessions') {
      return reply({ id: 'bps_1', object: 'billing_portal.session', url: 'https://portal.stripe.test/bps_1' });
    }
    if (req.method === 'GET' && url.pathname === '/v1/subscriptions') {
      const customer = url.searchParams.get('customer');
      const data = [...this.subscriptions.values()].filter((s) => s.customer === customer);
      return reply({ object: 'list', data, has_more: false, url: '/v1/subscriptions' });
    }
    const one = url.pathname.match(/^\/v1\/subscriptions\/([^/]+)$/);
    if (one) {
      const subscription = this.subscriptions.get(one[1]);
      if (!subscription) {
        return new Response(
          JSON.stringify({ error: { type: 'invalid_request_error', message: 'No such subscription' } }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return reply(subscription);
    }
    return new Response(JSON.stringify({ error: { message: `fake stripe: ${url.pathname}` } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Fausse base : tables en mémoire, filtres `col=eq.valeur`, insert / update / upsert, et le point
 * d'accès /auth/v1/user. Suffisant pour les requêtes des fonctions de facturation.
 */
export class FakeDb {
  tables: Record<string, Row[]> = {};
  /** Utilisateurs par jeton : { 'token-1': { id, email } }. */
  users: Record<string, { id: string; email: string }> = {};
  /** Tables dont toute écriture échoue (500), pour tester la reprise après erreur. */
  failWrites = new Set<string>();
  writes: { table: string; method: string; body: unknown; query: URLSearchParams }[] = [];
  server!: Deno.HttpServer;
  port = 0;

  start() {
    this.server = Deno.serve({ port: 0, onListen: ({ port }) => (this.port = port) }, (req) =>
      this.handle(req),
    );
    return this;
  }

  async stop() {
    await this.server.shutdown();
  }

  rows(table: string) {
    return (this.tables[table] ??= []);
  }

  private matches(row: Row, query: URLSearchParams) {
    for (const [key, value] of query) {
      if (['select', 'on_conflict', 'order', 'limit'].includes(key)) continue;
      if (value.startsWith('eq.') && String(row[key]) !== value.slice(3)) return false;
    }
    return true;
  }

  private async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

    if (url.pathname === '/auth/v1/user') {
      const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
      const user = this.users[token];
      if (!user) return json({ code: 401, msg: 'invalid JWT' }, 401);
      return json({ id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
    }

    const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
    if (!table) return json({ message: `fake db: ${url.pathname}` }, 404);
    const rows = this.rows(table);

    if (req.method === 'GET') {
      const found = rows.filter((row) => this.matches(row, url.searchParams));
      const wantsObject = (req.headers.get('Accept') ?? '').includes('vnd.pgrst.object+json');
      if (wantsObject) {
        if (found.length !== 1) {
          return json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${found.length} rows`, hint: null }, 406);
        }
        return json(found[0]);
      }
      return json(found);
    }

    const body = req.method === 'DELETE' ? null : await req.json().catch(() => null);
    this.writes.push({ table, method: req.method, body, query: url.searchParams });
    if (this.failWrites.has(table)) return json({ message: 'fake db: write failed', code: 'XX000' }, 500);

    if (req.method === 'POST') {
      const prefer = req.headers.get('Prefer') ?? '';
      const items = (Array.isArray(body) ? body : [body]) as Row[];
      for (const item of items) {
        const conflict = url.searchParams.get('on_conflict') ?? 'id';
        const existing = prefer.includes('merge-duplicates')
          ? rows.find((r) => r[conflict] === item[conflict])
          : undefined;
        if (existing) Object.assign(existing, item);
        else rows.push({ ...item });
      }
      return new Response(null, { status: 201 });
    }
    if (req.method === 'PATCH') {
      for (const row of rows.filter((r) => this.matches(r, url.searchParams))) Object.assign(row, body);
      return new Response(null, { status: 204 });
    }
    return json({ message: `fake db: ${req.method}` }, 405);
  }
}

/** Variables d'environnement lues par les fonctions, remises à zéro après chaque test. */
export function withEnv(values: Record<string, string>, fn: () => Promise<void>) {
  return async () => {
    const before = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(values)) {
      before.set(key, Deno.env.get(key));
      Deno.env.set(key, value);
    }
    try {
      await fn();
    } finally {
      for (const [key, previous] of before) {
        if (previous === undefined) Deno.env.delete(key);
        else Deno.env.set(key, previous);
      }
    }
  };
}
