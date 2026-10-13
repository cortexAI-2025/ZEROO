import type { MerchantSummary } from '@/features/discover/api';
import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert } from '@/types/database';

export type SavedAddress = Tables<'customer_addresses'>;
export type Profile = Tables<'profiles'>;

// ---- Profil ------------------------------------------------------------------------------

export async function fetchProfile(userId: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

export async function updateProfile(
  userId: string,
  patch: { display_name: string | null; phone: string | null },
) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

// ---- Adresses ------------------------------------------------------------------------------

export async function fetchAddresses(userId: string) {
  const { data, error } = await supabase
    .from('customer_addresses')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function addAddress(values: TablesInsert<'customer_addresses'>) {
  const { error } = await supabase.from('customer_addresses').insert(values);
  if (error) throw error;
}

export async function deleteAddress(id: string) {
  const { error } = await supabase.from('customer_addresses').delete().eq('id', id);
  if (error) throw error;
}

export async function setDefaultAddress(id: string) {
  const { error } = await supabase.rpc('set_default_address', { p_address_id: id });
  if (error) throw error;
}

// ---- Favoris -------------------------------------------------------------------------------

export async function fetchFavoriteIds(userId: string) {
  const { data, error } = await supabase
    .from('customer_favorites')
    .select('merchant_id')
    .eq('user_id', userId);
  if (error) throw error;
  return new Set(data.map((f) => f.merchant_id));
}

/** Restaurants favoris encore visibles (publiés), au format des listes. */
export async function fetchFavoriteMerchants(userId: string): Promise<MerchantSummary[]> {
  const { data, error } = await supabase
    .from('customer_favorites')
    .select(
      'created_at, merchants(id, slug, name, category, address_line, city, is_open_now, is_accepting_orders)',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.flatMap((f) =>
    f.merchants
      ? [
          {
            id: f.merchants.id,
            slug: f.merchants.slug,
            name: f.merchants.name,
            category: f.merchants.category,
            address_line: f.merchants.address_line,
            city: f.merchants.city,
            distance_m: null,
            is_open: !!f.merchants.is_open_now,
            is_accepting_orders: !!f.merchants.is_accepting_orders,
          },
        ]
      : [],
  );
}

export async function setFavorite(userId: string, merchantId: string, favorite: boolean) {
  const { error } = favorite
    ? await supabase.from('customer_favorites').insert({ user_id: userId, merchant_id: merchantId })
    : await supabase
        .from('customer_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('merchant_id', merchantId);
  if (error) throw error;
}
