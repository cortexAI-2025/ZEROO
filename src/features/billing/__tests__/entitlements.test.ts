import {
  courierCapacity,
  courierHasFeature,
  effectivePlan,
  isNightDelivery,
  MERCHANT_FEATURES,
  merchantHasFeature,
} from '../entitlements';

describe('droits des établissements', () => {
  it('Start : Click & Collect, livraison, QR, fidélité, précommandes et paniers', () => {
    for (const f of [
      'click_collect',
      'delivery',
      'qr_loyalty',
      'scheduled_orders',
      'baskets',
    ] as const) {
      expect(merchantHasFeature('start', f)).toBe(true);
    }
  });

  it('Start : ni Happy Hours, ni mini-site, ni statistiques avancées, ni commandes groupées, ni campagne', () => {
    for (const f of [
      'happy_hours',
      'minisite',
      'advanced_stats',
      'group_orders',
      'marketing_campaign',
    ] as const) {
      expect(merchantHasFeature('start', f)).toBe(false);
    }
  });

  it('Pro : tout', () => {
    for (const f of MERCHANT_FEATURES) expect(merchantHasFeature('pro', f)).toBe(true);
  });

  it('sans abonnement valide : rien', () => {
    for (const f of MERCHANT_FEATURES) expect(merchantHasFeature(null, f)).toBe(false);
  });
});

describe('formule en vigueur', () => {
  it("l'essai et l'actif ouvrent les droits", () => {
    expect(effectivePlan({ status: 'trialing', plan: 'pro' })).toBe('pro');
    expect(effectivePlan({ status: 'active', plan: 'start' })).toBe('start');
  });
  it('impayé, résilié ou absent : aucun droit', () => {
    expect(effectivePlan({ status: 'past_due', plan: 'pro' })).toBeNull();
    expect(effectivePlan({ status: 'canceled', plan: 'pro' })).toBeNull();
    expect(effectivePlan(null)).toBeNull();
  });
});

describe('droits des livreurs', () => {
  it('Start : missions classiques seulement, une course à la fois', () => {
    expect(courierHasFeature('start', 'classic_missions')).toBe(true);
    expect(courierHasFeature('start', 'multi_missions')).toBe(false);
    expect(courierHasFeature('start', 'night_delivery')).toBe(false);
    expect(courierCapacity('start')).toBe(1);
  });
  it('Pro : plusieurs courses et nuit', () => {
    expect(courierHasFeature('pro', 'multi_missions')).toBe(true);
    expect(courierHasFeature('pro', 'night_delivery')).toBe(true);
    expect(courierCapacity('pro')).toBe(2);
  });
  it('la nuit va de 22 h à 6 h, heure de Paris', () => {
    expect(isNightDelivery(new Date('2026-10-20T21:30:00Z'))).toBe(true); // 23 h 30
    expect(isNightDelivery(new Date('2026-10-20T03:00:00Z'))).toBe(true); // 5 h
    expect(isNightDelivery(new Date('2026-10-20T04:00:00Z'))).toBe(false); // 6 h
    expect(isNightDelivery(new Date('2026-10-20T12:00:00Z'))).toBe(false); // 14 h
  });
});
