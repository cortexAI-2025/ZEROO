import type { MerchantSummary } from './api';

/** Filtres de l'annuaire, combinables. Les moments de repas sont des « OU » entre eux. */
export type DirectoryFilters = {
  category: string | null;
  openNow: boolean;
  pickup: boolean;
  delivery: boolean;
  happyHour: boolean;
  mealPeriod: string | null;
};

export const NO_FILTERS: DirectoryFilters = {
  category: null,
  openNow: false,
  pickup: false,
  delivery: false,
  happyHour: false,
  mealPeriod: null,
};

export const activeFilterCount = (f: DirectoryFilters) =>
  [f.category, f.openNow, f.pickup, f.delivery, f.happyHour, f.mealPeriod].filter(Boolean).length;

/**
 * - « ouvert maintenant » : l'établissement accepte des commandes à cet instant ;
 * - « retrait » : il propose le retrait ;
 * - « livraison » : la livraison est disponible **maintenant** (un livreur peut la prendre) ;
 * - « Happy Hour » : une offre est en vigueur.
 */
export function applyFilters(
  merchants: readonly MerchantSummary[],
  filters: DirectoryFilters,
): MerchantSummary[] {
  return merchants.filter(
    (m) =>
      (!filters.category || m.category === filters.category) &&
      (!filters.openNow || m.is_accepting_orders) &&
      (!filters.pickup || m.offers_pickup) &&
      (!filters.delivery || m.delivery_available_now) &&
      (!filters.happyHour || m.has_happy_hour_now) &&
      (!filters.mealPeriod || m.meal_periods.includes(filters.mealPeriod)),
  );
}

/** Établissements placés sur la carte : seulement ceux qui ont une position publique. */
export function mappable(
  merchants: readonly MerchantSummary[],
): (MerchantSummary & { latitude: number; longitude: number })[] {
  return merchants.filter(
    (m): m is MerchantSummary & { latitude: number; longitude: number } =>
      m.latitude !== null && m.longitude !== null,
  );
}
