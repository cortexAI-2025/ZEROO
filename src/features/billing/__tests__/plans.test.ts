import {
  formatPrice,
  MERCHANT_PLANS,
  priceHtCents,
  priceTtcCents,
  yearlyMonthlyHtCents,
} from '../plans';

describe('grille tarifaire', () => {
  it.each([
    ['start', 'month', 999, 1199],
    ['start', 'year', 9999, 11999],
    ['pro', 'month', 1999, 2399],
    ['pro', 'year', 19999, 23999],
    ['courier', 'month', 999, 1199],
    ['courier', 'year', 9999, 11999],
  ] as const)('%s / %s : %i HT → %i TTC', (plan, interval, ht, ttc) => {
    expect(priceHtCents(plan, interval)).toBe(ht);
    expect(priceTtcCents(plan, interval)).toBe(ttc);
  });

  it('formate HT et TTC', () => {
    expect(formatPrice('start', 'month')).toEqual({ ht: '9,99 €', ttc: '11,99 €' });
    expect(formatPrice('pro', 'year')).toEqual({ ht: '199,99 €', ttc: '239,99 €' });
  });

  it('un restaurant choisit entre Start et Pro', () => {
    expect(MERCHANT_PLANS).toEqual(['start', 'pro']);
  });

  it("l'annuel coûte moins que 12 mois", () => {
    expect(yearlyMonthlyHtCents('start')).toBe(833);
    expect(yearlyMonthlyHtCents('pro')).toBe(1667);
    expect(priceHtCents('start', 'year')).toBeLessThan(priceHtCents('start', 'month') * 12);
  });
});
