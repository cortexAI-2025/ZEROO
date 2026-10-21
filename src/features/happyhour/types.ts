import type { Database } from '@/types/database';

/** Offre Happy Hour en vigueur pour un produit (la meilleure, calculée côté serveur). */
export type Offer = Database['public']['Functions']['active_happy_hours']['Returns'][number];

export type OfferMode = 'pickup' | 'delivery';

/** Offres indexées par produit : au plus une par produit. */
export type OffersByItem = ReadonlyMap<string, Offer>;
