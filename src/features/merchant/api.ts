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
  // Informations de l'entreprise saisies dès la création : enregistrées juste après.
  const { legal_name, siret, vat_number, contact_email } = formValuesToPatch(values);
  if (legal_name || siret || vat_number || contact_email) {
    await updateMerchant(data.id, { legal_name, siret, vat_number, contact_email });
  }
  return data;
}

export type MerchantPatch = Pick<
  TablesUpdate<'merchants'>,
  | 'legal_name'
  | 'photo_url'
  | 'payment_link'
  | 'public_phone'
  | 'public_phone_authorized'
  | 'siret'
  | 'vat_number'
  | 'contact_email'
  | 'name'
  | 'description'
  | 'category'
  | 'offers_pickup'
  | 'logo_url'
  | 'tagline'
  | 'about'
  | 'accent_color'
  | 'pickup_instructions'
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
  | 'accepts_cash_pickup'
  | 'group_orders_enabled'
  | 'group_min_lead_hours'
  | 'group_min_headcount'
  | 'group_min_total_cents'
  | 'marketing_consent'
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
    legal_name: values.legalName || null,
    siret: values.siret ? values.siret.replace(/\s/g, '') : null,
    vat_number: values.vatNumber ? values.vatNumber.replace(/\s/g, '').toUpperCase() : null,
    contact_email: values.contactEmail || null,
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

/** Ventes des derniers jours (jours sans vente compris), du plus ancien au plus récent. */
export async function fetchSalesByDay(merchantId: string, days = 7) {
  const { data, error } = await supabase.rpc('merchant_sales_by_day', {
    p_merchant_id: merchantId,
    p_days: days,
  });
  if (error) throw error;
  return data;
}

/** Produits les plus vendus : 7 jours en Start, davantage en Pro (règle appliquée par la base). */
export async function fetchTopItems(merchantId: string, days = 7) {
  const { data, error } = await supabase.rpc('merchant_top_items', {
    p_merchant_id: merchantId,
    p_days: days,
  });
  if (error) throw error;
  return data;
}

export type AdvancedStats = {
  period_days: number;
  orders_count: number;
  revenue_cents: number;
  average_basket_cents: number;
  cancelled_or_refused_count: number;
  pickup_orders: number;
  delivery_orders: number;
  scheduled_orders: number;
  group_orders: number;
  unique_customers: number;
  returning_customers: number;
  happy_hour_units: number;
  peak_hours: { hour: number; orders: number }[];
  top_items: { name: string; quantity: number; revenue_cents: number }[];
};

/** Statistiques avancées (formule Pro, refusées par la base sinon). */
export async function fetchAdvancedStats(merchantId: string, days = 30) {
  const { data, error } = await supabase.rpc('merchant_advanced_stats', {
    p_merchant_id: merchantId,
    p_days: days,
  });
  if (error) throw error;
  return data as unknown as AdvancedStats;
}
