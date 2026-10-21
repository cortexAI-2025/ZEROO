import type { Offer, OffersByItem } from './types';

/**
 * Mêmes règles que create_order() côté serveur, pour annoncer au client le prix qu'il paiera :
 *  - la réduction porte sur le prix du produit, pas sur les suppléments ;
 *  - le menu offert de la fidélité est au plein tarif (il remplace l'offre) ;
 *  - au-delà du stock restant de l'offre, le reste de la ligne est au tarif habituel.
 * Le serveur reste seul juge : il refuse la commande si ce total annoncé a changé.
 */
export type LinePricing = {
  totalCents: number;
  /** Unités vendues au prix promotionnel. */
  promoUnits: number;
  /** Économie par rapport au tarif habituel. */
  savingCents: number;
};

export function priceLine(input: {
  /** Tarif habituel d'une unité, suppléments compris. */
  unitPriceCents: number;
  quantity: number;
  offer?: Pick<Offer, 'regular_cents' | 'promo_cents' | 'quantity_remaining'>;
  /** 1 si l'une des unités est le menu offert par la fidélité. */
  rewardUnits?: 0 | 1;
}): LinePricing {
  const { unitPriceCents, quantity, offer } = input;
  const eligible = Math.max(quantity - (input.rewardUnits ?? 0), 0);
  const promoUnits = offer ? Math.min(eligible, offer.quantity_remaining ?? eligible) : 0;
  const savingCents = offer ? promoUnits * (offer.regular_cents - offer.promo_cents) : 0;
  return {
    totalCents: unitPriceCents * quantity - savingCents,
    promoUnits,
    savingCents,
  };
}

type PricedLine = { key: string; itemId: string; unitPriceCents: number; quantity: number };

/** Total d'une ligne du panier, avec l'offre en vigueur sur son produit. */
export function cartLinePricing(
  line: PricedLine,
  offers: OffersByItem | undefined,
  rewardLineKey: string | null,
): LinePricing {
  return priceLine({
    unitPriceCents: line.unitPriceCents,
    quantity: line.quantity,
    offer: offers?.get(line.itemId),
    rewardUnits: line.key === rewardLineKey ? 1 : 0,
  });
}

export function cartTotalWithOffers(
  lines: readonly PricedLine[],
  offers: OffersByItem | undefined,
  rewardLineKey: string | null,
): number {
  return lines.reduce((sum, l) => sum + cartLinePricing(l, offers, rewardLineKey).totalCents, 0);
}

export type OfferChange = { itemId: string; kind: 'ended' | 'changed' };

/**
 * Compare les offres vues avant et après un rafraîchissement, pour les produits du panier :
 * « ended » = l'offre s'est terminée (ou le stock est épuisé), « changed » = le prix promotionnel
 * a changé. Sert à prévenir le client plutôt que de modifier son total sans rien dire.
 */
export function offerChanges(
  before: OffersByItem,
  after: OffersByItem,
  cartItemIds: readonly string[],
): OfferChange[] {
  const changes: OfferChange[] = [];
  for (const itemId of new Set(cartItemIds)) {
    const was = before.get(itemId);
    const now = after.get(itemId);
    if (was && !now) changes.push({ itemId, kind: 'ended' });
    else if (was && now && was.promo_cents !== now.promo_cents) {
      changes.push({ itemId, kind: 'changed' });
    }
  }
  return changes;
}

/** Index des offres par produit. */
export function indexOffers(offers: readonly Offer[] | undefined): OffersByItem {
  return new Map((offers ?? []).map((o) => [o.item_id, o]));
}

/** Heure de fin d'une offre, affichée à l'heure de l'appareil (« HH:MM »). */
export function offerEndLabel(endsAt: string): string {
  const d = new Date(endsAt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
