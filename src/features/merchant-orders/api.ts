import { callFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';

import { ACTIVE_STATUSES, type Order, type OrderStatus } from './types';

const ORDER_SELECT = '*, order_items(*)' as const;

export async function fetchActiveOrders(merchantId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('merchant_id', merchantId)
    .in('status', ACTIVE_STATUSES)
    .order('placed_at', { ascending: true });
  if (error) throw error;
  return data as unknown as Order[];
}

export async function fetchOrderHistory(merchantId: string, limit = 50) {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('merchant_id', merchantId)
    .not('status', 'in', `(${[...ACTIVE_STATUSES, 'pending_payment'].join(',')})`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as unknown as Order[];
}

export type StatusChange = {
  orderId: string;
  status: OrderStatus;
  prepMinutes?: number;
  refusalReason?: string;
  pickupCode?: string;
};

export async function setOrderStatus(change: StatusChange) {
  // Accepter / refuser : capture ou annulation du paiement Stripe côté serveur.
  if (change.status === 'accepted' || change.status === 'refused') {
    await callFunction('order-decision', {
      orderId: change.orderId,
      decision: change.status === 'accepted' ? 'accept' : 'refuse',
      prepMinutes: change.prepMinutes,
      reason: change.refusalReason,
    });
    return;
  }
  const { error } = await supabase.rpc('set_order_status', {
    p_order_id: change.orderId,
    p_status: change.status,
    p_prep_minutes: change.prepMinutes,
    p_refusal_reason: change.refusalReason,
    p_pickup_code: change.pickupCode,
  });
  if (error) throw error;
}
