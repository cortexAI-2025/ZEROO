import { initPaymentSheet, initStripe, presentPaymentSheet } from '@stripe/stripe-react-native';

import { env } from '@/lib/env';
import { callFunction, FunctionError } from '@/lib/functions';

import { orderPayload, type PayOrderInput, type PayOrderResult } from './types';

/** Un paiement à confirmer : le repas (restaurant) ou la course (livreur). */
type NativePayment = {
  kind: 'meal' | 'delivery';
  clientSecret: string;
  stripeAccountId: string;
  displayName: string;
  amountCents: number;
};

type CreatedOrder = {
  orderId: string;
  /** Menu offert sans rien d'autre à payer : pas de paiement. */
  free?: boolean;
  /** Espèces au comptoir : pas de paiement en ligne. */
  cash?: boolean;
  payments?: NativePayment[];
};

/**
 * Paiement dans l'app : la commande est créée côté serveur, puis la feuille de paiement
 * Stripe (carte, Apple Pay, Google Pay) règle le repas sur le compte du restaurant. Le
 * montant est seulement autorisé : le débit n'a lieu que lorsque le restaurant accepte.
 * La course d'une livraison se règle plus tard, quand un livreur a accepté (payDelivery).
 */
export async function payOrder(input: PayOrderInput): Promise<PayOrderResult> {
  const created = await callFunction<CreatedOrder>('create-order', orderPayload(input, 'native'));
  if (created.free || created.cash) return { kind: 'paid', orderId: created.orderId };
  if (!env.stripePublishableKey) throw new FunctionError('payments_not_configured', 0);
  // Abandon à n'importe quelle étape : la commande est annulée et tout est libéré.
  const abandon = () =>
    callFunction('customer-cancel-order', { orderId: created.orderId }).catch(() => undefined);

  for (const payment of created.payments ?? []) {
    const outcome = await presentSheet(payment);
    if (outcome !== 'paid') {
      await abandon();
      if (outcome === 'cancelled') return { kind: 'cancelled' };
      throw new FunctionError('payment_failed', 0);
    }
  }

  // Confirme les autorisations sans attendre le webhook Stripe.
  await callFunction('order-payment-status', { orderId: created.orderId });
  return { kind: 'paid', orderId: created.orderId };
}

/** Feuille de paiement Stripe (charge directe : elle s'adresse au compte du vendeur). */
async function presentSheet(payment: NativePayment): Promise<'paid' | 'cancelled' | 'failed'> {
  const publishableKey = env.stripePublishableKey;
  if (!publishableKey) throw new FunctionError('payments_not_configured', 0);
  await initStripe({
    publishableKey,
    stripeAccountId: payment.stripeAccountId,
    merchantIdentifier: 'merchant.fr.zeroo',
    urlScheme: 'zeroo',
  });
  const init = await initPaymentSheet({
    paymentIntentClientSecret: payment.clientSecret,
    merchantDisplayName: payment.displayName,
    applePay: { merchantCountryCode: 'FR' },
    googlePay: {
      merchantCountryCode: 'FR',
      currencyCode: 'EUR',
      testEnv: publishableKey.startsWith('pk_test'),
    },
    returnURL: 'zeroo://stripe-redirect',
  });
  if (init.error) return 'failed';
  const result = await presentPaymentSheet();
  if (!result.error) return 'paid';
  return result.error.code === 'Canceled' ? 'cancelled' : 'failed';
}

/** Règle la course une fois la mission prise par un livreur (carte, Apple Pay, Google Pay). */
export async function payDelivery(orderId: string): Promise<'paid' | 'cancelled'> {
  const created = await callFunction<{ payment: NativePayment }>('pay-delivery', {
    orderId,
    channel: 'native',
  });
  const outcome = await presentSheet(created.payment);
  if (outcome === 'cancelled') return 'cancelled';
  if (outcome === 'failed') throw new FunctionError('payment_failed', 0);
  await callFunction('order-payment-status', { orderId });
  return 'paid';
}
