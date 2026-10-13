import type { Order } from '@/features/merchant-orders/types';
import { callFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type CustomerOrder = Order & {
  merchants: Pick<
    Tables<'merchants'>,
    'name' | 'slug' | 'address_line' | 'city' | 'latitude' | 'longitude' | 'phone'
  > | null;
};

const CUSTOMER_ORDER_SELECT =
  '*, order_items(*), merchants(name, slug, address_line, city, latitude, longitude, phone)';

/** Annulation par le client, tant que le commerçant n'a pas accepté (aucun débit). */
export async function cancelMyOrder(orderId: string) {
  await callFunction('customer-cancel-order', { orderId });
}

export async function fetchMyOrders(customerId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select(CUSTOMER_ORDER_SELECT)
    .eq('customer_id', customerId)
    .neq('status', 'pending_payment')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as unknown as CustomerOrder[];
}

export async function fetchOrder(orderId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select(CUSTOMER_ORDER_SELECT)
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as CustomerOrder | null;
}
