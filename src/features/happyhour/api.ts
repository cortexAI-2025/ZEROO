import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

import type { Offer, OfferMode } from './types';

/** Offres en vigueur maintenant pour le mode de commande (la meilleure par produit). */
export async function fetchActiveOffers(merchantId: string, mode: OfferMode): Promise<Offer[]> {
  const { data, error } = await supabase.rpc('active_happy_hours', {
    p_merchant_id: merchantId,
    p_mode: mode,
  });
  if (error) throw error;
  return data;
}

export type HappyHour = Tables<'happy_hours'> & {
  happy_hour_slots: Tables<'happy_hour_slots'>[];
  happy_hour_items: Tables<'happy_hour_items'>[];
};

/** Toutes les offres du commerçant (actives ou non), pour l'écran de gestion. */
export async function fetchHappyHours(merchantId: string): Promise<HappyHour[]> {
  const { data, error } = await supabase
    .from('happy_hours')
    .select('*, happy_hour_slots(*), happy_hour_items(*)')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Données d'une offre, telles qu'attendues par save_happy_hour(). */
export type HappyHourInput = {
  name: string;
  discount_type: 'percent' | 'price';
  percent_off: number | null;
  starts_on: string | null;
  ends_on: string | null;
  applies_to_pickup: boolean;
  applies_to_delivery: boolean;
  quantity_limit: number | null;
  is_active: boolean;
  slots: { weekday: number; starts_at: string; ends_at: string }[];
  items: { item_id: string; promo_price_cents: number | null }[];
};

export async function saveHappyHour(merchantId: string, id: string | null, input: HappyHourInput) {
  const { error } = await supabase.rpc('save_happy_hour', {
    p_merchant_id: merchantId,
    p_id: id,
    p_data: input,
  });
  if (error) throw error;
}

export async function setHappyHourActive(id: string, active: boolean) {
  const { error } = await supabase.rpc('set_happy_hour_active', { p_id: id, p_active: active });
  if (error) throw error;
}

export async function deleteHappyHour(id: string) {
  const { error } = await supabase.rpc('delete_happy_hour', { p_id: id });
  if (error) throw error;
}
