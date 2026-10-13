import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type OrderReview = Tables<'order_reviews'>;
export type MerchantRating = { average: number; count: number };

export async function fetchOrderReview(orderId: string) {
  const { data, error } = await supabase
    .from('order_reviews')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type ReviewInput = {
  orderId: string;
  merchantStars: number | null;
  courierStars: number | null;
  comment: string;
};

export async function submitReview(input: ReviewInput) {
  const { error } = await supabase.rpc('submit_order_review', {
    p_order_id: input.orderId,
    p_merchant_stars: input.merchantStars ?? undefined,
    p_courier_stars: input.courierStars ?? undefined,
    p_comment: input.comment.trim() || undefined,
  });
  if (error) throw error;
}

/** Notes publiques des restaurants, par identifiant (absent : pas encore d'avis). */
export async function fetchMerchantRatings(merchantIds: string[]) {
  const ratings = new Map<string, MerchantRating>();
  if (merchantIds.length === 0) return ratings;
  const { data, error } = await supabase.rpc('merchant_ratings', { p_merchant_ids: merchantIds });
  if (error) throw error;
  for (const row of data) {
    ratings.set(row.merchant_id, { average: Number(row.average), count: row.reviews_count });
  }
  return ratings;
}

/** Derniers avis reçus par le restaurant (RLS : le propriétaire seulement). */
export async function fetchMerchantReviews(merchantId: string, limit = 10) {
  const { data, error } = await supabase
    .from('order_reviews')
    .select('*')
    .eq('merchant_id', merchantId)
    .not('merchant_stars', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

/** Derniers avis reçus par le livreur (RLS : le livreur seulement). */
export async function fetchCourierReviews(courierId: string, limit = 10) {
  const { data, error } = await supabase
    .from('order_reviews')
    .select('*')
    .eq('courier_id', courierId)
    .not('courier_stars', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export type CourierRating = {
  average: number | null;
  count: number;
  /** Nombre d'avis par note, de 5 à 1 étoile. */
  distribution: { stars: number; count: number }[];
};

export async function fetchCourierRating(): Promise<CourierRating> {
  const { data, error } = await supabase.rpc('courier_rating_summary');
  if (error) throw error;
  const row = data[0];
  return {
    average: row?.average == null ? null : Number(row.average),
    count: row?.reviews_count ?? 0,
    distribution: [
      { stars: 5, count: row?.stars_5 ?? 0 },
      { stars: 4, count: row?.stars_4 ?? 0 },
      { stars: 3, count: row?.stars_3 ?? 0 },
      { stars: 2, count: row?.stars_2 ?? 0 },
      { stars: 1, count: row?.stars_1 ?? 0 },
    ],
  };
}
