import type { Order } from '@/features/merchant-orders/types';
import { callFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type CustomerOrder = Order & {
  merchants: Pick<
    Tables<'merchants'>,
    | 'name'
    | 'slug'
    | 'address_line'
    | 'city'
    | 'latitude'
    | 'longitude'
    | 'phone'
    | 'payment_link'
    | 'offers_pickup'
    | 'pickup_instructions'
  > | null;
};

const CUSTOMER_ORDER_SELECT =
  '*, order_items(*), merchants(name, slug, address_line:merchant_address_line, city, latitude:merchant_latitude, longitude:merchant_longitude, phone, payment_link, offers_pickup, pickup_instructions)';

/**
 * Livraison que personne ne prend (signalée après 15 minutes) : annulation par le client ou par
 * le restaurant. Le repas se règle directement avec le restaurant : aucun remboursement automatique.
 */
export async function cancelUnclaimedDelivery(orderId: string) {
  const { error } = await supabase.rpc('cancel_unclaimed_delivery', { p_order_id: orderId });
  if (error) throw error;
}

/** Cette commande en livraison attend toujours un livreur au-delà du délai ? */
export function isDeliveryUnclaimed(order: {
  fulfillment: string;
  status: string;
  courier_id: string | null;
  delivery_unclaimed_at: string | null;
}) {
  return (
    order.fulfillment === 'delivery' &&
    !order.courier_id &&
    !!order.delivery_unclaimed_at &&
    ['accepted', 'preparing', 'ready'].includes(order.status)
  );
}

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
