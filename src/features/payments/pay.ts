import { callFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';

import { orderPayload, type PayOrderInput } from './types';

/**
 * Envoie la commande au restaurant. Aucun paiement à ce stade : ZeeRoo n'encaisse rien.
 * Le client paie ensuite chaque professionnel via son lien de paiement (carte, Apple Pay,
 * Google Pay) ou en espèces, puis le professionnel confirme la réception.
 */
export async function placeOrder(input: PayOrderInput): Promise<{ orderId: string }> {
  return callFunction<{ orderId: string }>('create-order', orderPayload(input));
}

/** Le client indique avoir payé le repas ou la livraison via le lien du professionnel. */
export async function declarePayment(orderId: string, kind: 'meal' | 'delivery') {
  const { error } = await supabase.rpc('customer_declare_payment', {
    p_order_id: orderId,
    p_kind: kind,
  });
  if (error) throw error;
}

/** Le restaurant confirme avoir reçu le paiement du repas. */
export async function confirmMealPayment(orderId: string) {
  const { error } = await supabase.rpc('merchant_confirm_payment', { p_order_id: orderId });
  if (error) throw error;
}

/** Le livreur confirme avoir reçu le paiement de la livraison. */
export async function confirmDeliveryPayment(orderId: string) {
  const { error } = await supabase.rpc('courier_confirm_delivery_payment', {
    p_order_id: orderId,
  });
  if (error) throw error;
}

/** Lien de paiement valide : une adresse https (SumUp, PayPal, Stripe Payment Link…). */
export const isValidPaymentLink = (value: string) => /^https:\/\/\S{4,}$/.test(value.trim());
