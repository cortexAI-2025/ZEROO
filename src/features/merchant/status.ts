import type { Merchant } from './types';

export type MerchantStatus = 'setup' | 'unpublished' | 'noMode' | 'paused' | 'closed' | 'open';

/** Statut affiché en tête du tableau de bord, du plus bloquant au plus favorable. */
export function merchantStatus(m: Merchant): MerchantStatus {
  if (!m.is_payments_ready || !m.is_subscription_active) return 'setup';
  if (!m.is_published) return 'unpublished';
  if (!m.has_order_mode) return 'noMode';
  if (m.is_paused_now) return 'paused';
  if (!m.is_open_now) return 'closed';
  return 'open';
}

/**
 * Affilié = abonnement ZeeRoo en cours (essai ou actif) et encaissement configuré (lien de
 * paiement ou espèces). Aucun compte Stripe Connect n'est exigé : Stripe ne sert qu'à l'abonnement.
 * La base impose la même règle à la publication ; ceci ne sert qu'à l'expliquer dans l'écran.
 */
export function isAffiliated(m: Pick<Merchant, 'is_subscription_active' | 'is_payments_ready'>) {
  return m.is_subscription_active && m.is_payments_ready;
}

/** Publication possible : affilié, au moins un produit disponible et un créneau d'ouverture. */
export function canPublishMerchant(
  m: Pick<Merchant, 'is_subscription_active' | 'is_payments_ready'>,
  content: { hasAvailableItem: boolean; hasHours: boolean },
) {
  return isAffiliated(m) && content.hasAvailableItem && content.hasHours;
}
