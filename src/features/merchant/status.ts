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
