import { deliveryPausedNow, orderModes, resolveMode, showsAddress } from '../modes';

const flags = (
  offers_pickup: boolean,
  offers_delivery: boolean | null,
  delivery_available_now: boolean | null,
) => ({ offers_pickup, offers_delivery, delivery_available_now });

describe('orderModes', () => {
  it('liste le retrait avant la livraison', () => {
    expect(orderModes(flags(true, true, true))).toEqual(['pickup', 'delivery']);
  });

  it('gère le retrait seul et la livraison seule (dark kitchen)', () => {
    expect(orderModes(flags(true, false, false))).toEqual(['pickup']);
    expect(orderModes(flags(false, true, true))).toEqual(['delivery']);
  });

  it('ne propose pas la livraison quand aucun livreur ne peut la prendre', () => {
    expect(orderModes(flags(true, true, false))).toEqual(['pickup']);
    expect(orderModes(flags(false, true, false))).toEqual([]);
  });

  it('ne propose aucun mode sans retrait ni livraison, ou quand les données manquent', () => {
    expect(orderModes(flags(false, false, false))).toEqual([]);
    expect(orderModes(flags(false, null, null))).toEqual([]);
    expect(orderModes(undefined)).toEqual([]);
  });
});

describe('deliveryPausedNow', () => {
  it('signale une livraison proposée mais momentanément indisponible', () => {
    expect(deliveryPausedNow(flags(false, true, false))).toBe(true);
    expect(deliveryPausedNow(flags(true, true, false))).toBe(true);
  });

  it('ne signale rien quand la livraison est disponible ou n’est pas proposée', () => {
    expect(deliveryPausedNow(flags(true, true, true))).toBe(false);
    expect(deliveryPausedNow(flags(true, false, false))).toBe(false);
    expect(deliveryPausedNow(null)).toBe(false);
  });
});

describe('resolveMode', () => {
  it('garde le mode souhaité quand il est proposé', () => {
    expect(resolveMode('delivery', ['pickup', 'delivery'])).toBe('delivery');
  });

  it('se rabat sur le seul mode proposé', () => {
    expect(resolveMode('pickup', ['delivery'])).toBe('delivery');
    expect(resolveMode('delivery', ['pickup'])).toBe('pickup');
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

describe('orderModes : précommande', () => {
  it("la livraison programmée n'exige pas de livreur en ligne maintenant", () => {
    const f = { offers_pickup: true, offers_delivery: true, delivery_available_now: false };
    expect(orderModes(f)).toEqual(['pickup']);
    expect(orderModes(f, true)).toEqual(['pickup', 'delivery']);
  });
  it('sans livraison activée, jamais de livraison programmée', () => {
    const f = { offers_pickup: true, offers_delivery: false, delivery_available_now: false };
    expect(orderModes(f, true)).toEqual(['pickup']);
  });
});
