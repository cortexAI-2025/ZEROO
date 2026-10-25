import { canPublishMerchant, isAffiliated, merchantStatus } from '../status';
import type { Merchant } from '../types';

const merchant = (over: Partial<Merchant> = {}) =>
  ({
    is_published: false,
    is_payments_ready: true,
    is_subscription_active: true,
    has_order_mode: true,
    is_paused_now: false,
    is_open_now: true,
    ...over,
  }) as Merchant;

const content = { hasAvailableItem: true, hasHours: true };

describe('isAffiliated', () => {
  it('exige un abonnement en cours ET un encaissement configuré', () => {
    expect(isAffiliated(merchant())).toBe(true);
    expect(isAffiliated(merchant({ is_subscription_active: false }))).toBe(false);
    expect(isAffiliated(merchant({ is_payments_ready: false }))).toBe(false);
  });
});

describe('canPublishMerchant', () => {
  it('autorise la publication d’un affilié dont la fiche est complète', () => {
    expect(canPublishMerchant(merchant(), content)).toBe(true);
  });

  it('refuse sans abonnement, même avec menu et horaires', () => {
    expect(canPublishMerchant(merchant({ is_subscription_active: false }), content)).toBe(false);
  });

  it('refuse sans encaissement, même avec abonnement', () => {
    expect(canPublishMerchant(merchant({ is_payments_ready: false }), content)).toBe(false);
  });

  it('refuse un affilié sans produit disponible ou sans horaires', () => {
    expect(canPublishMerchant(merchant(), { ...content, hasAvailableItem: false })).toBe(false);
    expect(canPublishMerchant(merchant(), { ...content, hasHours: false })).toBe(false);
  });
});

describe('merchantStatus', () => {
  it('signale la configuration tant que le commerce n’est pas affilié', () => {
    expect(merchantStatus(merchant({ is_subscription_active: false }))).toBe('setup');
  });

  it('affilié mais non publié : « unpublished »', () => {
    expect(merchantStatus(merchant())).toBe('unpublished');
  });
});
