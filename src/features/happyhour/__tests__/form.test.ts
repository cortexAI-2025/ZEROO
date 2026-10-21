import { emptyForm, formFromOffer, type HappyHourForm, validateForm } from '../form';

const catalog = new Map([
  ['kebab', { price_cents: 750 }],
  ['canette', { price_cents: 150 }],
]);

const valid = (over: Partial<HappyHourForm> = {}): HappyHourForm => ({
  ...emptyForm(),
  name: 'Happy kebab',
  itemIds: ['kebab'],
  ...over,
});

describe('validateForm', () => {
  it('produit les données du serveur pour une offre en pourcentage', () => {
    const result = validateForm(valid(), catalog);
    expect(result).toEqual({
      ok: true,
      input: {
        name: 'Happy kebab',
        discount_type: 'percent',
        percent_off: 20,
        starts_on: null,
        ends_on: null,
        applies_to_pickup: true,
        applies_to_delivery: true,
        quantity_limit: null,
        is_active: true,
        slots: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          starts_at: '17:00',
          ends_at: '19:00',
        })),
        items: [{ item_id: 'kebab', promo_price_cents: null }],
      },
    });
  });

  it('accepte une plage qui passe minuit, une période et un stock', () => {
    const result = validateForm(
      valid({
        windows: [{ weekdays: [5], start: '22h', end: '3h' }],
        validFrom: '01/11/2026',
        validTo: '30/11/2026',
        quantity: '40',
      }),
      catalog,
    );
    expect(result).toMatchObject({
      ok: true,
      input: {
        slots: [{ weekday: 5, starts_at: '22:00', ends_at: '03:00' }],
        starts_on: '2026-11-01',
        ends_on: '2026-11-30',
        quantity_limit: 40,
      },
    });
  });

  it('exige que le prix promotionnel soit une vraie réduction', () => {
    const form = valid({ discountType: 'price', prices: { kebab: '7,50' } });
    expect(validateForm(form, catalog)).toEqual({ ok: false, errors: ['prices'] });
    expect(validateForm({ ...form, prices: { kebab: '6' } }, catalog)).toMatchObject({
      ok: true,
      input: { percent_off: null, items: [{ item_id: 'kebab', promo_price_cents: 600 }] },
    });
  });

  it('signale chaque champ invalide', () => {
    const result = validateForm(
      valid({
        name: ' ',
        percent: '95',
        windows: [{ weekdays: [], start: '10:00', end: '10:00' }],
        validFrom: '31/02/2026',
        quantity: '0',
        pickup: false,
        delivery: false,
        itemIds: [],
      }),
      catalog,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect([...result.errors].sort()).toEqual(
        ['items', 'modes', 'name', 'percent', 'quantity', 'validity', 'windows'].sort(),
      );
    }
  });

  it('refuse une période dont la fin précède le début', () => {
    expect(
      validateForm(valid({ validFrom: '10/11/2026', validTo: '01/11/2026' }), catalog),
    ).toEqual({ ok: false, errors: ['validity'] });
  });
});

describe('formFromOffer', () => {
  it('regroupe les jours qui partagent les mêmes heures', () => {
    const form = formFromOffer({
      id: 'o',
      merchant_id: 'm',
      name: 'Midi',
      discount_type: 'price',
      percent_off: null,
      starts_on: '2026-11-01',
      ends_on: null,
      applies_to_pickup: true,
      applies_to_delivery: false,
      quantity_limit: 30,
      quantity_used: 4,
      is_active: false,
      created_at: '2026-10-23T08:00:00Z',
      happy_hour_slots: [1, 2, 3].map((weekday) => ({
        id: `s${weekday}`,
        happy_hour_id: 'o',
        merchant_id: 'm',
        weekday,
        starts_at: '11:30:00',
        ends_at: '14:00:00',
      })),
      happy_hour_items: [
        { happy_hour_id: 'o', merchant_id: 'm', item_id: 'kebab', promo_price_cents: 600 },
      ],
    });
    expect(form).toMatchObject({
      name: 'Midi',
      discountType: 'price',
      windows: [{ weekdays: [1, 2, 3], start: '11:30', end: '14:00' }],
      validFrom: '01/11/2026',
      validTo: '',
      quantity: '30',
      pickup: true,
      delivery: false,
      itemIds: ['kebab'],
      prices: { kebab: '6,00' },
      active: false,
    });
  });
});
