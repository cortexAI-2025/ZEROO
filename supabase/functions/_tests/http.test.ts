import { assertEquals } from 'jsr:@std/assert@1';

import { HttpError, handle } from '../_shared/http.ts';

const call = (fn: () => Promise<Response>) =>
  handle(fn)(new Request('http://local/', { method: 'POST', body: '{}' }));

// Codes que create_order / apply_order_transition lèvent et que l'application traduit (src/lib/errors.ts) :
// ils doivent arriver au client tels quels (HTTP 400), jamais en « internal_error ».
const BUSINESS_CODES = [
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
  'merchant_not_accepting',
  'item_unavailable',
  'invalid_options',
  'invalid_quantity',
  'empty_order',
  'delivery_out_of_range',
  'no_courier_available',
  'invalid_pickup_code',
  'invalid_transition',
];

for (const code of BUSINESS_CODES) {
  Deno.test(`erreur métier SQL « ${code} » : HTTP 400 avec le code`, async () => {
    const res = await call(() => Promise.reject(new Error(code)));
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, code);
  });
}

Deno.test('erreur inconnue : HTTP 500 internal_error sans détail', async () => {
  const res = await call(() => Promise.reject(new Error('relation "x" does not exist')));
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: 'internal_error' });
});

Deno.test('HttpError : statut et code conservés', async () => {
  const res = await call(() => Promise.reject(new HttpError(409, 'invalid_transition')));
  assertEquals(res.status, 409);
});
