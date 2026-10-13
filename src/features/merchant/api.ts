import { supabase } from '@/lib/supabase';
import type { TablesUpdate } from '@/types/database';

import type { Slot } from './hours';
import type { MerchantFormValues } from './schemas';
import { MERCHANT_SELECT } from './types';

export async function fetchMyMerchant(ownerId: string) {
  const { data, error } = await supabase
    .from('merchants')
    .select(MERCHANT_SELECT)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createMerchant(values: MerchantFormValues) {
  const { data, error } = await supabase.rpc('create_merchant', {
    p_name: values.name,
    p_category: values.category,
    p_address_line: values.address.addressLine,
    p_postal_code: values.address.postalCode,
    p_city: values.address.city,
    p_latitude: values.address.latitude,
    p_longitude: values.address.longitude,
    p_phone: values.phone || undefined,
    p_description: values.description || undefined,
    p_default_prep_minutes: values.defaultPrepMinutes,
  });
  if (error) throw error;
  return data;
}

export type MerchantPatch = Pick<
  TablesUpdate<'merchants'>,
  | 'name'
  | 'description'
  | 'category'
  | 'phone'
  | 'address_line'
  | 'postal_code'
  | 'city'
  | 'latitude'
  | 'longitude'
  | 'default_prep_minutes'
  | 'is_paused'
  | 'paused_until'
  | 'is_published'
  | 'delivery_enabled'
  | 'delivery_fee_cents'
  | 'delivery_radius_m'
>;

export async function updateMerchant(id: string, patch: MerchantPatch) {
  const { error } = await supabase.from('merchants').update(patch).eq('id', id);
  if (error) throw error;
}

export function formValuesToPatch(values: MerchantFormValues): MerchantPatch {
  return {
    name: values.name,
    category: values.category,
    description: values.description || null,
    phone: values.phone || null,
    default_prep_minutes: values.defaultPrepMinutes,
    address_line: values.address.addressLine,
    postal_code: values.address.postalCode,
    city: values.address.city,
    latitude: values.address.latitude,
    longitude: values.address.longitude,
  };
}

export async function fetchOpeningHours(merchantId: string) {
  const { data, error } = await supabase
    .from('merchant_opening_hours')
    .select('*')
    .eq('merchant_id', merchantId)
    .order('weekday')
    .order('opens_at');
  if (error) throw error;
  return data;
}

export async function saveOpeningHours(merchantId: string, slots: Slot[]) {
  const { error } = await supabase.rpc('set_opening_hours', {
    p_merchant_id: merchantId,
    p_slots: slots.map((s) => ({ weekday: s.weekday, opens_at: s.opensAt, closes_at: s.closesAt })),
  });
  if (error) throw error;
}

export async function fetchTodaySummary(merchantId: string) {
  const { data, error } = await supabase
    .rpc('merchant_today_summary', { p_merchant_id: merchantId })
    .single();
  if (error) throw error;
  return data;
}
