import type { CartLine, DeliveryDetails } from '@/features/cart/store';

export type PayOrderInput = {
  merchantId: string;
  merchantName: string;
  lines: CartLine[];
  note: string;
  rewardLineKey: string | null;
  /** Retrait : espèces au comptoir si le restaurant l'accepte (défaut : carte). */
  mealPayment?: 'card' | 'cash';
  /** Livraison : course réglée par carte (quand un livreur accepte) ou en espèces au livreur. */
  deliveryPayment?: 'card' | 'cash';
  /** Absent : retrait sur place. */
  delivery?: DeliveryDetails;
};

/** paid : commande payée ; cancelled : feuille fermée ; redirect : page Stripe ouverte (web). */
export type PayOrderResult =
  { kind: 'paid'; orderId: string } | { kind: 'cancelled' } | { kind: 'redirect' };

export const orderPayload = (input: PayOrderInput, channel: 'native' | 'web') => ({
  merchantId: input.merchantId,
  items: input.lines.map((l) => ({
    itemId: l.itemId,
    quantity: l.quantity,
    optionIds: l.options.map((o) => o.id),
    useReward: l.key === input.rewardLineKey,
  })),
  note: input.note.trim() || undefined,
  channel,
  mealPayment: input.mealPayment ?? 'card',
  deliveryPayment: input.deliveryPayment ?? 'card',
  delivery: input.delivery
    ? { ...input.delivery, instructions: input.delivery.instructions.trim() || undefined }
    : undefined,
});
