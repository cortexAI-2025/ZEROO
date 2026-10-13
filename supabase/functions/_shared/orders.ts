import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';

import type { Stripe } from './stripe.ts';
import { unwrap } from './supabase.ts';

export type OrderRow = {
  id: string;
  merchant_id: string;
  customer_id: string | null;
  pickup_code: string;
  status: string;
  total_cents: number;
  stripe_account_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  fulfillment: 'pickup' | 'delivery';
  delivery_fee_cents: number;
  courier_id: string | null;
  courier_stripe_account_id: string | null;
  delivery_payment_intent_id: string | null;
  delivery_checkout_session_id: string | null;
  courier_accepted_at: string | null;
};

export async function fetchOrder(db: SupabaseClient, orderId: string): Promise<OrderRow | null> {
  return unwrap(
    await db.from('orders').select('*').eq('id', orderId).maybeSingle(),
  ) as OrderRow | null;
}

type PaymentRef = {
  account: string | null;
  paymentIntentId: string | null;
  checkoutSessionId: string | null;
};

/** Paiement du repas (compte du restaurant). */
export const mealPayment = (
  order: Pick<
    OrderRow,
    'stripe_account_id' | 'stripe_payment_intent_id' | 'stripe_checkout_session_id'
  >,
): PaymentRef => ({
  account: order.stripe_account_id,
  paymentIntentId: order.stripe_payment_intent_id,
  checkoutSessionId: order.stripe_checkout_session_id,
});

/** Paiement de la course (compte du livreur). */
export const deliveryPayment = (
  order: Pick<
    OrderRow,
    'courier_stripe_account_id' | 'delivery_payment_intent_id' | 'delivery_checkout_session_id'
  >,
): PaymentRef => ({
  account: order.courier_stripe_account_id,
  paymentIntentId: order.delivery_payment_intent_id,
  checkoutSessionId: order.delivery_checkout_session_id,
});

/**
 * Libère une autorisation de paiement (refus, annulation, expiration) : le client
 * n'est jamais débité et le vendeur ne paie aucun frais. Sans effet si déjà fait.
 */
export async function releasePayment(stripe: Stripe, payment: PaymentRef) {
  const options = payment.account ? { stripeAccount: payment.account } : undefined;
  try {
    if (payment.paymentIntentId) {
      await stripe.paymentIntents.cancel(payment.paymentIntentId, undefined, options);
    } else if (payment.checkoutSessionId) {
      await stripe.checkout.sessions.expire(payment.checkoutSessionId, undefined, options);
    }
  } catch (error) {
    // Déjà annulé ou expiré : rien à faire. Les autres erreurs sont journalisées ;
    // Stripe libère de toute façon une autorisation non capturée au bout de 7 jours.
    console.warn('Libération du paiement impossible', (error as Error).message);
  }
}

/** Libère le repas et, pour une livraison, la course. */
export async function releaseOrderPayments(
  stripe: Stripe,
  order: Pick<
    OrderRow,
    | 'stripe_account_id'
    | 'stripe_payment_intent_id'
    | 'stripe_checkout_session_id'
    | 'courier_stripe_account_id'
    | 'delivery_payment_intent_id'
    | 'delivery_checkout_session_id'
  >,
) {
  await releasePayment(stripe, mealPayment(order));
  await releasePayment(stripe, deliveryPayment(order));
}
