import { cartTotalWithOffers, indexOffers, offerChanges, priceLine } from '../pricing';
import type { Offer } from '../types';

const offer = (over: Partial<Offer> = {}): Offer => ({
  happy_hour_id: 'hh1',
  name: 'Happy kebab',
  item_id: 'kebab',
  regular_cents: 750,
  promo_cents: 600,
  ends_at: '2026-10-23T17:00:00Z',
  quantity_remaining: null,
  ...over,
});

describe('priceLine', () => {
  it('applique la réduction à chaque unité, suppléments au plein tarif', () => {
    // Menu 10,50 € -20 % = 8,40 €, + 1,00 € de supplément : 9,40 € l'unité au lieu de 11,50 €.
    const result = priceLine({
      unitPriceCents: 1150,
      quantity: 2,
      offer: offer({ regular_cents: 1050, promo_cents: 840 }),
    });
    expect(result).toEqual({ totalCents: 1880, promoUnits: 2, savingCents: 420 });
  });

  it('sans offre : tarif habituel', () => {
    expect(priceLine({ unitPriceCents: 750, quantity: 3 })).toEqual({
      totalCents: 2250,
      promoUnits: 0,
      savingCents: 0,
    });
  });

  it('le menu offert reste au plein tarif, les autres unités profitent de l’offre', () => {
    const result = priceLine({
      unitPriceCents: 1050,
      quantity: 2,
      offer: offer({ regular_cents: 1050, promo_cents: 840 }),
      rewardUnits: 1,
    });
    expect(result).toEqual({ totalCents: 1890, promoUnits: 1, savingCents: 210 });
  });

  it('au-delà du stock restant, le reste est au tarif habituel', () => {
    const result = priceLine({
      unitPriceCents: 750,
      quantity: 3,
      offer: offer({ quantity_remaining: 1 }),
    });
    expect(result).toEqual({ totalCents: 600 + 750 + 750, promoUnits: 1, savingCents: 150 });
  });

  it('un stock épuisé ne donne aucune réduction', () => {
    expect(
      priceLine({ unitPriceCents: 750, quantity: 1, offer: offer({ quantity_remaining: 0 }) })
        .totalCents,
    ).toBe(750);
  });
});

describe('cartTotalWithOffers', () => {
  const lines = [
    { key: 'a', itemId: 'kebab', unitPriceCents: 750, quantity: 2 },
    { key: 'b', itemId: 'canette', unitPriceCents: 150, quantity: 1 },
  ];

  it('additionne les lignes avec leurs offres', () => {
    expect(cartTotalWithOffers(lines, indexOffers([offer()]), null)).toBe(1200 + 150);
  });

  it('sans offre, retombe sur le total habituel', () => {
    expect(cartTotalWithOffers(lines, undefined, null)).toBe(1650);
  });
});

describe('offerChanges', () => {
  it('signale une offre terminée ou un prix qui change, pour les produits du panier seulement', () => {
    const before = indexOffers([
      offer(),
      offer({ item_id: 'canette', promo_cents: 100, regular_cents: 150 }),
      offer({ item_id: 'tacos', promo_cents: 800, regular_cents: 1050 }),
    ]);
    const after = indexOffers([offer({ promo_cents: 525 }), offer({ item_id: 'tacos' })]);
    expect(offerChanges(before, after, ['kebab', 'canette'])).toEqual([
      { itemId: 'kebab', kind: 'changed' },
      { itemId: 'canette', kind: 'ended' },
    ]);
  });

  it('ne signale rien quand une offre apparaît ou reste identique', () => {
    const same = indexOffers([offer()]);
    expect(offerChanges(same, same, ['kebab'])).toEqual([]);
    expect(offerChanges(indexOffers([]), same, ['kebab'])).toEqual([]);
  });
});
