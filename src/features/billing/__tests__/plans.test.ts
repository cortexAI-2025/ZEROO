import {
  COURIER_PLANS,
  formatPrice,
  MERCHANT_PLANS,
  planTier,
  priceHtCents,
  priceTtcCents,
  yearlyMonthlyHtCents,
} from '../plans';

describe('grille tarifaire', () => {
  it.each([
    ['start', 'month', 1999, 2399],
    ['start', 'year', 19999, 23999],
    ['pro', 'month', 2999, 3599],
    ['pro', 'year', 29999, 35999],
    ['courier_start', 'month', 1499, 1799],
    ['courier_start', 'year', 14999, 17999],
    ['courier_pro', 'month', 2499, 2999],
    ['courier_pro', 'year', 24999, 29999],
  ] as const)('%s / %s : %i HT → %i TTC', (plan, interval, ht, ttc) => {
    expect(priceHtCents(plan, interval)).toBe(ht);
    expect(priceTtcCents(plan, interval)).toBe(ttc);
  });

  it('formate HT et TTC', () => {
    expect(formatPrice('start', 'month')).toEqual({ ht: '19,99 €', ttc: '23,99 €' });
    expect(formatPrice('pro', 'year')).toEqual({ ht: '299,99 €', ttc: '359,99 €' });
    expect(formatPrice('courier_pro', 'month')).toEqual({ ht: '24,99 €', ttc: '29,99 €' });
  });

  it('un établissement choisit entre Start et Pro, un livreur aussi', () => {
    expect(MERCHANT_PLANS).toEqual(['start', 'pro']);
    expect(COURIER_PLANS).toEqual(['courier_start', 'courier_pro']);
  });

  it('le niveau envoyé au serveur est start ou pro', () => {
    expect(planTier('courier_pro')).toBe('pro');
    expect(planTier('courier_start')).toBe('start');
    expect(planTier('pro')).toBe('pro');
    expect(planTier('start')).toBe('start');
  });

  it("l'annuel coûte moins que 12 mois", () => {
    expect(yearlyMonthlyHtCents('start')).toBe(1667);
    expect(yearlyMonthlyHtCents('pro')).toBe(2500);
    expect(priceHtCents('start', 'year')).toBeLessThan(priceHtCents('start', 'month') * 12);
    expect(priceHtCents('courier_pro', 'year')).toBeLessThan(
      priceHtCents('courier_pro', 'month') * 12,
    );
  });
});
