import type { MenuCategory } from '@/features/menu/types';
import { MERCHANT_SELECT } from '@/features/merchant/types';
import { supabase } from '@/lib/supabase';

export type MerchantSummary = {
  id: string;
  slug: string;
  name: string;
  category: string;
  /** `null` pour un établissement qui n'accueille pas le public (dark kitchen). */
  address_line: string | null;
  city: string;
  distance_m: number | null;
  is_open: boolean;
  is_accepting_orders: boolean;
  offers_pickup: boolean;
  offers_delivery: boolean;
};

export async function fetchNearbyMerchants(
  latitude: number,
  longitude: number,
): Promise<MerchantSummary[]> {
  const { data, error } = await supabase.rpc('nearby_merchants', {
    p_latitude: latitude,
    p_longitude: longitude,
  });
  if (error) throw error;
  return data;
}

export async function searchMerchants(query: string): Promise<MerchantSummary[]> {
  const { data, error } = await supabase.rpc('search_merchants', { p_query: query });
  if (error) throw error;
  return data;
}

/** Fiche publique d'un commerce : infos, horaires et menu visible des clients. */
export async function fetchMerchantPage(slug: string) {
  const { data: merchant, error } = await supabase
    .from('merchants')
    .select(`${MERCHANT_SELECT}, merchant_opening_hours(*)`)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!merchant) return null;

  const { data: categories, error: menuError } = await supabase
    .from('menu_categories')
    .select('*, menu_items(*, menu_option_groups(*, menu_options(*)))')
    .eq('merchant_id', merchant.id)
    .eq('is_active', true);
  if (menuError) throw menuError;

  const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
  const menu: MenuCategory[] = categories
    .sort(byPosition)
    .map((c) => ({
      ...c,
      menu_items: c.menu_items.sort(byPosition).map((i) => ({
        ...i,
        menu_option_groups: i.menu_option_groups.sort(byPosition).map((g) => ({
          ...g,
          // Les options en rupture ne sont pas proposées.
          menu_options: g.menu_options.filter((o) => o.is_available).sort(byPosition),
        })),
      })),
    }))
    .filter((c) => c.menu_items.length > 0);

  return { merchant, menu };
}

export type MerchantPage = NonNullable<Awaited<ReturnType<typeof fetchMerchantPage>>>;

/** Photos des restaurants listés (les fonctions de recherche ne les renvoient pas). */
export async function fetchMerchantPhotos(merchantIds: string[]) {
  const photos = new Map<string, string>();
  if (merchantIds.length === 0) return photos;
  const { data, error } = await supabase
    .from('merchants')
    .select('id, photo_url')
    .in('id', merchantIds)
    .not('photo_url', 'is', null);
  if (error) throw error;
  for (const row of data) if (row.photo_url) photos.set(row.id, row.photo_url);
  return photos;
}
