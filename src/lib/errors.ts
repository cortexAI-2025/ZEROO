import { authErrorKey } from '@/features/auth/errors';

/** Erreurs métier levées par nos fonctions SQL (raise exception '<code>'). */
const businessErrors = {
  merchant_already_exists: 'errors.merchantAlreadyExists',
  invalid_pickup_code: 'errors.invalidPickupCode',
  invalid_transition: 'errors.invalidTransition',
  prep_minutes_required: 'errors.prepMinutesRequired',
  order_not_found: 'errors.orderNotFound',
  merchant_owner_cannot_delete: 'errors.merchantOwnerCannotDelete',
  merchant_not_accepting: 'errors.merchantNotAccepting',
  item_unavailable: 'errors.itemUnavailable',
  invalid_options: 'errors.invalidOptions',
  invalid_quantity: 'errors.invalidQuantity',
  empty_order: 'errors.emptyOrder',
  amount_too_small: 'errors.amountTooSmall',
  payment_capture_failed: 'errors.paymentCaptureFailed',
  payment_failed: 'errors.paymentFailed',
  payments_not_configured: 'errors.paymentsNotConfigured',
  already_subscribed: 'errors.alreadySubscribed',
  invalid_reward: 'errors.invalidReward',
  no_reward_available: 'errors.noRewardAvailable',
  payment_action_required: 'errors.invalidTransition',
  delivery_unavailable: 'errors.deliveryUnavailable',
  delivery_out_of_range: 'errors.deliveryOutOfRange',
  no_courier_available: 'errors.noCourierAvailable',
  invalid_delivery_address: 'errors.invalidDeliveryAddress',
  invalid_delivery_phone: 'errors.invalidDeliveryPhone',
  courier_not_confirmed: 'errors.courierNotConfirmed',
  invalid_delivery_code: 'errors.invalidDeliveryCode',
  courier_exists: 'errors.courierExists',
  invalid_siret: 'errors.invalidSiret',
  siret_taken: 'errors.siretTaken',
  courier_profile_required: 'errors.courierProfileRequired',
  courier_payments_not_ready: 'errors.courierPaymentsNotReady',
  courier_subscription_inactive: 'errors.courierSubscriptionInactive',
  courier_no_merchant: 'errors.courierNoMerchant',
  link_rejected: 'errors.linkRejected',
  merchant_not_found: 'errors.merchantNotFound',
  courier_not_found: 'errors.courierNotFound',
  courier_has_active_delivery: 'errors.courierHasActiveDelivery',
  courier_subscription_active: 'errors.courierSubscriptionActive',
} as const;

export type ErrorKey =
  (typeof businessErrors)[keyof typeof businessErrors] | ReturnType<typeof authErrorKey>;

/** Clé i18n à afficher pour une erreur Supabase (auth, PostgREST ou métier). */
export function errorKey(error: unknown): ErrorKey {
  const message = (error as { message?: string } | null)?.message ?? '';
  for (const [code, key] of Object.entries(businessErrors)) {
    if (message.startsWith(code)) return key as ErrorKey;
  }
  return authErrorKey(error);
}
