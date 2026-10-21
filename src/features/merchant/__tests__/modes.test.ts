import { orderModes, resolveMode, showsAddress } from '../modes';

describe('orderModes', () => {
  it('liste le retrait avant la livraison', () => {
    expect(orderModes({ offers_pickup: true, offers_delivery: true })).toEqual([
      'pickup',
      'delivery',
    ]);
  });

  it('gère le retrait seul et la livraison seule (dark kitchen)', () => {
    expect(orderModes({ offers_pickup: true, offers_delivery: false })).toEqual(['pickup']);
    expect(orderModes({ offers_pickup: false, offers_delivery: true })).toEqual(['delivery']);
  });

  it('ne propose aucun mode sans retrait ni livraison, ou quand les données manquent', () => {
    expect(orderModes({ offers_pickup: false, offers_delivery: false })).toEqual([]);
    expect(orderModes({ offers_pickup: false, offers_delivery: null })).toEqual([]);
    expect(orderModes(undefined)).toEqual([]);
  });
});

describe('resolveMode', () => {
  it('garde le mode souhaité quand il est proposé', () => {
    expect(resolveMode('delivery', ['pickup', 'delivery'])).toBe('delivery');
  });

  it('se rabat sur le seul mode proposé', () => {
    expect(resolveMode('pickup', ['delivery'])).toBe('delivery');
  });

  it('renvoie null quand aucun mode n’est proposé', () => {
    expect(resolveMode('pickup', [])).toBeNull();
  });
});

describe('showsAddress', () => {
  it('masque l’adresse d’un établissement sans accueil du public', () => {
    expect(showsAddress({ offers_pickup: false })).toBe(false);
    expect(showsAddress({ offers_pickup: true })).toBe(true);
    expect(showsAddress(null)).toBe(false);
  });
});
