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
  payments?: NativePayment[];
};

/**
 * Paiement dans l'app : la commande est créée côté serveur, puis une feuille de paiement
 * Stripe (carte, Apple Pay, Google Pay) par vendeur : le repas sur le compte du restaurant,
 * puis, pour une livraison, la course sur le compte du livreur. Les montants sont seulement
 * autorisés : le débit n'a lieu que lorsque le restaurant accepte.
 */
export async function payOrder(input: PayOrderInput): Promise<PayOrderResult> {
  const created = await callFunction<CreatedOrder>('create-order', orderPayload(input, 'native'));
  if (created.free) return { kind: 'paid', orderId: created.orderId };
  if (!env.stripePublishableKey) throw new FunctionError('payments_not_configured', 0);
  // Abandon à n'importe quelle étape : la commande est annulée et tout est libéré.
  const abandon = () =>
    callFunction('customer-cancel-order', { orderId: created.orderId }).catch(() => undefined);
  const testMode = env.stripePublishableKey.startsWith('pk_test');

  for (const payment of created.payments ?? []) {
    // Charge directe : la feuille de paiement s'adresse au compte Stripe du vendeur.
    await initStripe({
      publishableKey: env.stripePublishableKey,
      stripeAccountId: payment.stripeAccountId,
      merchantIdentifier: 'merchant.fr.zeroo',
      urlScheme: 'zeroo',
    });
    const init = await initPaymentSheet({
      paymentIntentClientSecret: payment.clientSecret,
      merchantDisplayName: payment.displayName,
      applePay: { merchantCountryCode: 'FR' },
      googlePay: { merchantCountryCode: 'FR', currencyCode: 'EUR', testEnv: testMode },
      returnURL: 'zeroo://stripe-redirect',
    });
    if (init.error) {
      await abandon();
      throw new FunctionError('payment_failed', 0);
    }
    const result = await presentPaymentSheet();
    if (result.error) {
      await abandon();
      if (result.error.code === 'Canceled') return { kind: 'cancelled' };
      throw new FunctionError('payment_failed', 0);
    }
  }

  // Confirme les autorisations sans attendre le webhook Stripe.
  await callFunction('order-payment-status', { orderId: created.orderId });
  return { kind: 'paid', orderId: created.orderId };
}
