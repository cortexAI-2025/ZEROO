import { supabase } from '@/lib/supabase';

import type { BasketInput } from './form';
import type { Basket, Reservation } from './types';

/** Paniers d'un commerce encore proposables : actifs, créneau pas terminé (vue publique). */
export async function fetchPublicBaskets(merchantId: string): Promise<Basket[]> {
  const { data, error } = await supabase
    .from('surprise_baskets')
    .select('*, is_reservable')
    .eq('merchant_id', merchantId)
    .eq('is_active', true)
    .gt('pickup_ends_at', new Date().toISOString())
    .order('pickup_starts_at');
  if (error) throw error;
  return data;
}

export type BasketWithReservations = Basket & { basket_reservations: Reservation[] };

/** Tous les paniers du commerçant, avec leurs réservations (retirées ou non). */
export async function fetchMerchantBaskets(merchantId: string): Promise<BasketWithReservations[]> {
  const { data, error } = await supabase
    .from('surprise_baskets')
    .select('*, is_reservable, basket_reservations(*)')
    .eq('merchant_id', merchantId)
    .order('pickup_starts_at', { ascending: false });
  if (error) throw error;
  return data as unknown as BasketWithReservations[];
}

export type MyReservation = Reservation & {
  surprise_baskets: Pick<
    Basket,
    'title' | 'is_surprise' | 'contents' | 'pickup_starts_at' | 'pickup_ends_at'
  > & {
    merchants: {
      name: string;
      slug: string;
      address_line: string;
      city: string;
      offers_pickup: boolean;
    } | null;
  };
};

export async function fetchMyReservations(userId: string): Promise<MyReservation[]> {
  const { data, error } = await supabase
    .from('basket_reservations')
    .select(
      '*, surprise_baskets(title, is_surprise, contents, pickup_starts_at, pickup_ends_at, merchants(name, slug, address_line, city, offers_pickup))',
    )
    .eq('customer_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data as unknown as MyReservation[];
}

export async function saveBasket(merchantId: string, id: string | null, input: BasketInput) {
  const { error } = await supabase.rpc('save_basket', {
    p_merchant_id: merchantId,
    p_id: id,
    p_data: input,
  });
  if (error) throw error;
}

export async function setBasketActive(id: string, active: boolean) {
  const { error } = await supabase.rpc('set_basket_active', { p_id: id, p_active: active });
  if (error) throw error;
}

export async function reserveBasket(basketId: string, quantity: number) {
  const { data, error } = await supabase.rpc('reserve_basket', {
    p_basket_id: basketId,
    p_quantity: quantity,
  });
  if (error) throw error;
  return data;
}

export async function cancelReservation(id: string) {
  const { error } = await supabase.rpc('cancel_basket_reservation', { p_id: id });
  if (error) throw error;
}

export async function collectReservation(id: string, code: string) {
  const { error } = await supabase.rpc('collect_basket_reservation', { p_id: id, p_code: code });
  if (error) throw error;
}
