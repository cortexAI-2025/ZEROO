import type { PlanTier } from './plans';

/**
 * Droits par formule. Cette table ne sert qu'à l'affichage (cadenas, invitations à passer en Pro) :
 * les règles sont appliquées par la base de données (voir supabase/migrations/20261029090000_commercial_offer.sql,
 * 20261030090000_scheduled_group_orders.sql, 20261031090000_advanced_stats.sql, 20261101090000_marketing_campaigns.sql).
 * Un abonnement n'ouvre ses droits qu'en essai ou actif : `plan` vaut null sinon.
 */
export type MerchantFeature =
  | 'click_collect'
  | 'delivery'
  | 'qr_loyalty'
  | 'scheduled_orders'
  | 'baskets'
  | 'happy_hours'
  | 'minisite'
  | 'advanced_stats'
  | 'group_orders'
  | 'marketing_campaign';

export const MERCHANT_FEATURES: readonly MerchantFeature[] = [
  'click_collect',
  'delivery',
  'qr_loyalty',
  'scheduled_orders',
  'baskets',
  'happy_hours',
  'minisite',
  'advanced_stats',
  'group_orders',
  'marketing_campaign',
];

const MERCHANT_PRO_ONLY: readonly MerchantFeature[] = [
  'happy_hours',
  'minisite',
  'advanced_stats',
  'group_orders',
  'marketing_campaign',
];

export type CourierFeature = 'classic_missions' | 'multi_missions' | 'night_delivery';
export const COURIER_FEATURES: readonly CourierFeature[] = [
  'classic_missions',
  'multi_missions',
  'night_delivery',
];
const COURIER_PRO_ONLY: readonly CourierFeature[] = ['multi_missions', 'night_delivery'];

/** Formule en vigueur à partir de l'abonnement : seuls l'essai et l'actif comptent. */
export function effectivePlan(
  subscription: { status: string; plan: string } | null | undefined,
): PlanTier | null {
  if (!subscription || !['trialing', 'active'].includes(subscription.status)) return null;
  return subscription.plan === 'pro' ? 'pro' : 'start';
}

export function merchantHasFeature(plan: PlanTier | null, feature: MerchantFeature) {
  if (!plan) return false;
  return plan === 'pro' || !MERCHANT_PRO_ONLY.includes(feature);
}

export function courierHasFeature(plan: PlanTier | null, feature: CourierFeature) {
  if (!plan) return false;
  return plan === 'pro' || !COURIER_PRO_ONLY.includes(feature);
}

/** Courses simultanées d'un livreur : une en Start, deux (groupées) en Pro. */
export const courierCapacity = (plan: PlanTier | null) => (plan === 'pro' ? 2 : 1);

/** Livraison de nuit : 22 h – 6 h, heure de Paris (même règle que la base). */
export function isNightDelivery(date: Date) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Europe/Paris',
    }).format(date),
  );
  return hour >= 22 || hour < 6;
}
