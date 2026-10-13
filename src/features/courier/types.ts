import type { Order } from '@/features/merchant-orders/types';
import type { Database, Enums, Tables } from '@/types/database';

export type Courier = Tables<'couriers'>;
export type CourierVehicle = Enums<'courier_vehicle'>;
export type CourierLegalStatus = Enums<'courier_legal_status'>;
export type CourierLinkStatus = Enums<'courier_link_status'>;

export const VEHICLES = ['bike', 'scooter', 'car', 'foot'] as const satisfies CourierVehicle[];
export const LEGAL_STATUSES = [
  'auto_entrepreneur',
  'societe',
] as const satisfies CourierLegalStatus[];

/** Course : commande livrée attribuée au livreur, avec le restaurant où la retirer. */
export type CourierRun = Order & {
  merchants: Pick<
    Tables<'merchants'>,
    'name' | 'address_line' | 'postal_code' | 'city' | 'latitude' | 'longitude' | 'phone'
  > | null;
};

/** Mission proposée aux livreurs : sans l'adresse précise du client. */
export type Mission = Database['public']['Functions']['available_missions']['Returns'][number];

export const RUN_ACTIVE_STATUSES = [
  'placed',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
] as const;

/** Rattachement du livreur à un restaurant. */
export type CourierLink = Tables<'merchant_couriers'> & {
  merchants: Pick<
    Tables<'merchants'>,
    'name' | 'city' | 'slug' | 'delivery_enabled' | 'delivery_fee_cents' | 'delivery_radius_m'
  > | null;
};

export type Earnings = {
  today_cents: number;
  today_count: number;
  week_cents: number;
  month_cents: number;
  month_count: number;
};
