import { callFunction } from '@/lib/functions';

import { orderPayload, type PayOrderInput, type PayOrderResult } from './types';

/**
 * Paiement sur le web (client arrivé par le QR code sans l'app) : page Stripe Checkout
 * hébergée, qui renvoie ensuite vers /order/<id>?paid=1 ou /cart?cancelled=<id>.
 */
export async function payOrder(input: PayOrderInput): Promise<PayOrderResult> {
  const created = await callFunction<{
    orderId: string;
    checkoutUrl?: string;
    free?: boolean;
    cash?: boolean;
  }>('create-order', orderPayload(input, 'web'));
  // Menu offert ou espèces au comptoir : la commande part sans passer par Stripe.
  if (created.free || created.cash || !created.checkoutUrl)
    return { kind: 'paid', orderId: created.orderId };
  globalThis.location.assign(created.checkoutUrl);
  return { kind: 'redirect' };
}

/** Règle la course sur le web (page Stripe Checkout du livreur), une fois la mission prise. */
export async function payDelivery(orderId: string): Promise<'paid' | 'cancelled' | 'redirect'> {
  const result = await callFunction<{ orderId: string; checkoutUrl: string }>('pay-delivery', {
    orderId,
    channel: 'web',
  });
  globalThis.location.assign(result.checkoutUrl);
  return 'redirect';
}
