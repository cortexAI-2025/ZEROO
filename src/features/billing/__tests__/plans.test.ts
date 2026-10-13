import {
  formatPrice,
  MERCHANT_PLANS,
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
    ['courier', 'month', 1499, 1799],
    ['courier', 'year', 14999, 17999],
  ] as const)('%s / %s : %i HT → %i TTC', (plan, interval, ht, ttc) => {
    expect(priceHtCents(plan, interval)).toBe(ht);
    expect(priceTtcCents(plan, interval)).toBe(ttc);
  });

  it('formate HT et TTC', () => {
    expect(formatPrice('start', 'month')).toEqual({ ht: '19,99 €', ttc: '23,99 €' });
    expect(formatPrice('pro', 'year')).toEqual({ ht: '299,99 €', ttc: '359,99 €' });
  });

  it('un restaurant choisit entre Start et Pro', () => {
    expect(MERCHANT_PLANS).toEqual(['start', 'pro']);
  });

  it("l'annuel coûte moins que 12 mois", () => {
    expect(yearlyMonthlyHtCents('start')).toBe(1667);
    expect(yearlyMonthlyHtCents('pro')).toBe(2500);
    expect(priceHtCents('start', 'year')).toBeLessThan(priceHtCents('start', 'month') * 12);
  });
});
