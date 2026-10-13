import { formatCents } from '@/lib/money';

/**
 * Grille tarifaire ZeeRoo (prix HT, TVA 20 % en plus). Seuls les abonnements passent par Stripe :
 * les restaurants et les livreurs encaissent directement leurs ventes et leurs courses.
 * Le client ne paie rien.
 *
 *   Restaurant Start : 19,99 € HT / mois · 199,99 € HT / an
 *   Restaurant Pro   : 29,99 € HT / mois · 299,99 € HT / an
 *   Livreur          : 14,99 € HT / mois · 149,99 € HT / an
 *
 * Les prix réellement facturés sont ceux des prix Stripe (voir supabase/functions/billing).
 * Ce catalogue ne sert qu'à l'affichage : le garder aligné sur Stripe.
 */
export type PlanId = 'start' | 'pro' | 'courier';
export type Interval = 'month' | 'year';

export const VAT_RATE = 0.2;
export const MERCHANT_PLANS = ['start', 'pro'] as const;

const PRICE_HT_CENTS: Record<PlanId, Record<Interval, number>> = {
  start: { month: 1999, year: 19999 },
  pro: { month: 2999, year: 29999 },
  courier: { month: 1499, year: 14999 },
};

export const priceHtCents = (plan: PlanId, interval: Interval) => PRICE_HT_CENTS[plan][interval];

/** TTC arrondi au centime : 1999 → 2399, 19999 → 23999. */
export const priceTtcCents = (plan: PlanId, interval: Interval) =>
  Math.round(priceHtCents(plan, interval) * (1 + VAT_RATE));

/** Affichage : « 19,99 € HT (23,99 € TTC) ». */
export function formatPrice(plan: PlanId, interval: Interval) {
  return {
    ht: formatCents(priceHtCents(plan, interval)),
    ttc: formatCents(priceTtcCents(plan, interval)),
  };
}

/** Équivalent mensuel d'un abonnement annuel, en centimes HT (199,99 € → 16,67 €). */
export const yearlyMonthlyHtCents = (plan: PlanId) => Math.round(priceHtCents(plan, 'year') / 12);
