import type { Tables } from '@/types/database';

export type Basket = Tables<'surprise_baskets'>;
export type Reservation = Tables<'basket_reservations'>;

/** Les 14 allergènes à déclaration obligatoire (règlement UE 1169/2011). */
export const ALLERGENS = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soy',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;
export type Allergen = (typeof ALLERGENS)[number];
