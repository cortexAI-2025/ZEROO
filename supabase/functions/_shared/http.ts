// Réponses HTTP communes aux Edge Functions.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Erreur métier renvoyée telle quelle à l'app : `code` correspond à une clé i18n. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Erreurs levées par nos fonctions SQL (`raise exception '<code>'`). */
const SQL_BUSINESS_ERRORS = [
  'merchant_not_accepting',
  'item_unavailable',
  'invalid_options',
  'invalid_quantity',
  'empty_order',
  'too_many_items',
  'note_too_long',
  'invalid_transition',
  'prep_minutes_required',
  'invalid_pickup_code',
  'order_not_found',
  'invalid_reward',
  'no_reward_available',
  'delivery_unavailable',
  'delivery_out_of_range',
  'no_courier_available',
  'invalid_delivery_address',
  'invalid_delivery_phone',
  'courier_not_confirmed',
  // Erreurs levées par create_order / apply_order_transition que l'application sait traduire (src/lib/errors.ts) :
  // sans cette liste elles remontaient en « internal_error » (HTTP 500) et le client voyait un message générique.
  'price_changed',
  'item_out_of_slot',
  'pickup_unavailable',
  'merchant_closed_at_slot',
  'invalid_schedule',
  'cash_not_accepted',
  'cash_not_allowed_for_delivery',
  'courier_not_assigned',
  'invalid_delivery_code',
  'group_orders_unavailable',
  'invalid_group_order',
  'group_lead_time',
  'group_minimum_not_reached',
];

/** Enveloppe un handler : CORS, POST uniquement, corps JSON, erreurs normalisées. */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    try {
      return await fn(req);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.code }, error.status);
      const message = (error as { message?: string })?.message ?? '';
      const business = SQL_BUSINESS_ERRORS.find((code) => message.startsWith(code));
      if (business) return json({ error: business }, 400);
      console.error(error);
      return json({ error: 'internal_error' }, 500);
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'invalid_body');
  }
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}
