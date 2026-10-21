import type { Tables } from '@/types/database';

/** Ligne lue avec MERCHANT_SELECT. */
export type Merchant = Omit<
  Tables<'merchants'>,
  'merchant_address_line' | 'merchant_latitude' | 'merchant_longitude' | 'has_happy_hour_now'
>;
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
  'id, owner_id, slug, name, description, category, phone, postal_code, city, timezone, default_prep_minutes, is_paused, paused_until, is_published, created_at, updated_at, delivery_enabled, delivery_fee_cents, delivery_radius_m, accepts_cash_pickup, legal_name, siret, vat_number, contact_email, photo_url, payment_link, offers_pickup, pickup_instructions, logo_url, tagline, about, accent_color, address_line:merchant_address_line, latitude:merchant_latitude, longitude:merchant_longitude, group_orders_enabled, group_min_lead_hours, group_min_headcount, group_min_total_cents, marketing_consent, marketing_consent_at, is_open_now, is_paused_now, is_accepting_orders, is_payments_ready, is_subscription_active, has_delivery_option, has_order_mode, offers_delivery, delivery_available_now, has_minisite' as const;

/** Lien public du commerce, cible du QR code. */
export const merchantPublicUrl = (slug: string) => `https://zeeroo.fr/m/${slug}`;
