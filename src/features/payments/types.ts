import type { CartLine, DeliveryDetails, GroupOrder } from '@/features/cart/store';
import { cartLinePricing } from '@/features/happyhour/pricing';
import type { OffersByItem } from '@/features/happyhour/types';

export type PayOrderInput = {
  merchantId: string;
  merchantName: string;
  lines: CartLine[];
  note: string;
  rewardLineKey: string | null;
  /** Retrait : espèces au comptoir si le restaurant l'accepte (défaut : carte via son lien). */
  mealPayment?: 'card' | 'cash';
  /** Livraison : carte via le lien du livreur (quand il accepte) ou espèces au livreur. */
  deliveryPayment?: 'card' | 'cash';
  /** Absent : retrait sur place. */
  delivery?: DeliveryDetails;
  /** Offres Happy Hour vues par le client : le prix annoncé est revérifié par le serveur. */
  offers?: OffersByItem;
  /** Précommande : instant choisi (ISO). Absent : dès que possible. */
  scheduledFor?: string | null;
  /** Commande groupée entreprise (précommande obligatoire). */
  group?: GroupOrder | null;
};

export const orderPayload = (input: PayOrderInput) => ({
  merchantId: input.merchantId,
  items: input.lines.map((l) => ({
    itemId: l.itemId,
    quantity: l.quantity,
    optionIds: l.options.map((o) => o.id),
    useReward: l.key === input.rewardLineKey,
    expectedTotalCents: input.offers
      ? cartLinePricing(l, input.offers, input.rewardLineKey).totalCents
      : undefined,
  })),
  note: input.note.trim() || undefined,
  mealPayment: input.mealPayment ?? 'card',
  deliveryPayment: input.deliveryPayment ?? 'card',
  scheduledFor: input.scheduledFor ?? undefined,
  group: input.group
    ? { companyName: input.group.companyName.trim(), headcount: input.group.headcount }
    : undefined,
  delivery: input.delivery
    ? { ...input.delivery, instructions: input.delivery.instructions.trim() || undefined }
    : undefined,
});
