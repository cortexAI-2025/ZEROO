import type { Tables } from '@/types/database';

export type Merchant = Tables<'merchants'>;
export type OpeningHour = Tables<'merchant_opening_hours'>;

export const MERCHANT_CATEGORIES = [
  'snack',
  'sandwicherie',
  'restaurant',
  'boulangerie',
  'dark_kitchen',
  'autre',
] as const;
export type MerchantCategory = (typeof MERCHANT_CATEGORIES)[number];

/** Colonnes lues partout : la ligne + les colonnes calculées par Postgres. */
export const MERCHANT_SELECT =
  '*, is_open_now, is_paused_now, is_accepting_orders, is_payments_ready, is_subscription_active, has_delivery_option, has_order_mode, offers_delivery, delivery_available_now' as const;

/** Lien public du commerce, cible du QR code. */
export const merchantPublicUrl = (slug: string) => `https://zeeroo.fr/m/${slug}`;
