import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';

import { unwrap } from './supabase.ts';

export type OrderRow = {
  id: string;
  merchant_id: string;
  customer_id: string | null;
  pickup_code: string;
  status: string;
  total_cents: number;
  stripe_account_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  fulfillment: 'pickup' | 'delivery';
  delivery_fee_cents: number;
  courier_id: string | null;
  courier_stripe_account_id: string | null;
  delivery_payment_intent_id: string | null;
  delivery_checkout_session_id: string | null;
  courier_accepted_at: string | null;
  courier_name: string | null;
  meal_payment_method: 'card' | 'cash';
  delivery_payment_method: 'card' | 'cash';
};

export async function fetchOrder(db: SupabaseClient, orderId: string): Promise<OrderRow | null> {
  return unwrap(
    await db.from('orders').select('*').eq('id', orderId).maybeSingle(),
  ) as OrderRow | null;
}
