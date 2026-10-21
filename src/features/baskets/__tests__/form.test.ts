import { basketToForm, emptyBasketForm, pickupWindow, validateBasket } from '../form';
import type { Basket } from '../types';

// Mardi 3 novembre 2026, 15:00 (heure locale de la machine de test).
const now = new Date(2026, 10, 3, 15, 0);
const valid = (over = {}) => ({
  ...emptyBasketForm(),
  title: 'Panier du soir',
  price: '3,99',
  allergensConfirmed: true,
  ...over,
});

describe('pickupWindow', () => {
  it('construit le créneau du jour', () => {
    const w = pickupWindow({ dayOffset: 0, start: '18:00', end: '19:30' }, now)!;
    expect([
      w.starts.getDate(),
      w.starts.getHours(),
      w.ends.getHours(),
      w.ends.getMinutes(),
    ]).toEqual([3, 18, 19, 30]);
  });

  it('passe minuit quand la fin précède le début', () => {
    const w = pickupWindow({ dayOffset: 0, start: '23:00', end: '00:30' }, now)!;
    expect(w.starts.getDate()).toBe(3);
    expect(w.ends.getDate()).toBe(4);
    expect(w.ends.getHours()).toBe(0);
  });

  it('gère demain et les heures saisies à la française', () => {
    const w = pickupWindow({ dayOffset: 1, start: '8h30', end: '9h' }, now)!;
    expect([w.starts.getDate(), w.starts.getHours(), w.starts.getMinutes()]).toEqual([4, 8, 30]);
  });

  it('refuse des heures invalides ou égales', () => {
    expect(pickupWindow({ dayOffset: 0, start: '25:00', end: '19:00' }, now)).toBeNull();
    expect(pickupWindow({ dayOffset: 0, start: '18:00', end: '18:00' }, now)).toBeNull();
  });
});

describe('validateBasket', () => {
  it('produit les données du serveur pour un panier surprise', () => {
    const result = validateBasket(valid({ allergens: ['gluten', 'milk'], value: '12' }), now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input).toMatchObject({
        title: 'Panier du soir',
        contents: null,
        is_surprise: true,
        price_cents: 399,
        estimated_value_cents: 1200,
        quantity_total: 5,
        allergens: ['gluten', 'milk'],
        allergens_confirmed: true,
        is_active: true,
      });
    }
  });

  it('exige le contenu d’un panier non surprise', () => {
    expect(validateBasket(valid({ isSurprise: false }), now)).toEqual({
      ok: false,
      errors: ['contents'],
    });
    expect(validateBasket(valid({ isSurprise: false, contents: '2 viennoiseries' }), now).ok).toBe(
      true,
    );
  });

  it('exige que l’information allergènes soit certifiée pour proposer le panier', () => {
    expect(validateBasket(valid({ allergensConfirmed: false }), now)).toEqual({
      ok: false,
      errors: ['allergens'],
    });
    // Un brouillon (inactif) peut être enregistré sans certification.
    expect(validateBasket(valid({ allergensConfirmed: false, active: false }), now).ok).toBe(true);
  });

  it('signale prix, valeur, quantité et créneau invalides', () => {
    const result = validateBasket(
      valid({ price: '0,50', value: '0,40', quantity: '0', start: '19:00', end: '19:00' }),
      now,
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect([...result.errors].sort()).toEqual(['price', 'quantity', 'value', 'window']);
  });

  it('refuse un créneau déjà terminé ou de plus de 12 heures', () => {
    expect(validateBasket(valid({ start: '08:00', end: '10:00' }), now)).toEqual({
      ok: false,
      errors: ['window'],
    });
    expect(validateBasket(valid({ start: '08:00', end: '21:00', dayOffset: 1 }), now)).toEqual({
      ok: false,
      errors: ['window'],
    });
  });
});

describe('basketToForm', () => {
  it('reprend un panier existant', () => {
    const basket = {
      title: 'Panier',
      is_surprise: false,
      contents: '2 pains',
      price_cents: 450,
      estimated_value_cents: null,
      quantity_total: 8,
      allergens: ['gluten'],
      allergens_confirmed: true,
      pickup_starts_at: new Date(2026, 10, 4, 18, 0).toISOString(),
      pickup_ends_at: new Date(2026, 10, 4, 19, 0).toISOString(),
      is_active: true,
    } as unknown as Basket;
    expect(basketToForm(basket, now)).toMatchObject({
      price: '4,50',
      value: '',
      quantity: '8',
      dayOffset: 1,
      start: '18:00',
      end: '19:00',
    });
  });
});
