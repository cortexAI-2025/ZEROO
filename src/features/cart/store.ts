import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { cartTotalWithOffers } from '@/features/happyhour/pricing';
import type { OffersByItem } from '@/features/happyhour/types';

import type { ChosenOption } from './pricing';

export type CartLine = {
  /** Produit + options : deux lignes identiques sont fusionnées. */
  key: string;
  itemId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  options: ChosenOption[];
  /** Menu formule : compte pour la fidélité et peut être offert. */
  isLoyaltyMenu: boolean;
  /** Prix du menu hors suppléments : montant déduit s'il est offert. */
  basePriceCents: number;
};

export type CartMerchant = { id: string; slug: string; name: string };

/** Adresse choisie dans la liste des suggestions (donc géolocalisée). */
export type DeliveryAddress = {
  addressLine: string;
  postalCode: string;
  city: string;
  latitude: number;
  longitude: number;
};

/** Ce que le serveur reçoit pour une livraison : adresse et contact pour le livreur. */
export type DeliveryDetails = DeliveryAddress & { phone: string; instructions: string };

export type Fulfillment = 'pickup' | 'delivery';

/** Commande groupée entreprise (formule Pro de l'établissement). */
export type GroupOrder = { companyName: string; headcount: number };

const memory = new Map<string, string>();
const memoryStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
};

type CartState = {
  merchant: CartMerchant | null;
  lines: CartLine[];
  note: string;
  /** Ligne sur laquelle le client utilise un menu offert (une unité), ou null. */
  rewardLineKey: string | null;
  fulfillment: Fulfillment;
  /** Gardés d'une commande à l'autre : c'est souvent la même adresse. */
  deliveryAddress: DeliveryAddress | null;
  deliveryPhone: string;
  deliveryInstructions: string;
  /** Précommande : instant choisi (ISO), ou null pour « dès que possible ». */
  scheduledFor: string | null;
  group: GroupOrder | null;
  /** Ajoute une ligne ; renvoie false si le panier contient déjà un autre commerce. */
  add: (
    merchant: CartMerchant,
    line: Omit<CartLine, 'key'>,
    options?: { replace?: boolean },
  ) => boolean;
  setQuantity: (key: string, quantity: number) => void;
  /** Remplace les lignes (remise au prix de la carte actuelle). */
  setLines: (lines: CartLine[]) => void;
  setNote: (note: string) => void;
  setRewardLine: (key: string | null) => void;
  setFulfillment: (fulfillment: Fulfillment) => void;
  setDeliveryAddress: (address: DeliveryAddress) => void;
  setDeliveryPhone: (phone: string) => void;
  setDeliveryInstructions: (instructions: string) => void;
  setScheduledFor: (scheduledFor: string | null) => void;
  setGroup: (group: GroupOrder | null) => void;
  clear: () => void;
};

export const lineKey = (itemId: string, optionIds: string[]) =>
  [itemId, ...[...optionIds].sort()].join('|');

export const cartTotalCents = (lines: CartLine[]) =>
  lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);

/** Même règle que le serveur pour le téléphone donné au livreur. */
export const isValidDeliveryPhone = (phone: string) => /^\+?\d[\d .-]{8,18}\d$/.test(phone.trim());

export const cartCount = (lines: CartLine[]) => lines.reduce((sum, line) => sum + line.quantity, 0);

/** Minimum Stripe : un reste plus petit est offert avec le menu (même règle qu'en base). */
const MIN_CHARGE_CENTS = 50;

/**
 * Remise du menu offert, estimée comme create_order() la calculera : prix de base d'un
 * menu de la ligne choisie (suppléments dus), ou tout le panier si le reste < 0,50 €.
 */
export function cartDiscountCents(
  lines: CartLine[],
  rewardLineKey: string | null,
  offers?: OffersByItem,
): number {
  const line = lines.find((l) => l.key === rewardLineKey && l.isLoyaltyMenu);
  if (!line) return 0;
  const total = cartTotalWithOffers(lines, offers, rewardLineKey);
  return total - line.basePriceCents < MIN_CHARGE_CENTS ? total : line.basePriceCents;
}

/** Panier unique, pour un seul commerce, conservé sur l'appareil entre deux lancements. */
export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      merchant: null,
      lines: [],
      note: '',
      rewardLineKey: null,
      fulfillment: 'pickup',
      deliveryAddress: null,
      deliveryPhone: '',
      deliveryInstructions: '',
      scheduledFor: null,
      group: null,
      add: (merchant, line, options) => {
        const state = get();
        if (
          state.merchant &&
          state.merchant.id !== merchant.id &&
          state.lines.length > 0 &&
          !options?.replace
        ) {
          return false;
        }
        const sameMerchant = state.merchant?.id === merchant.id;
        const lines = sameMerchant ? state.lines : [];
        const key = lineKey(
          line.itemId,
          line.options.map((o) => o.id),
        );
        const existing = lines.find((l) => l.key === key);
        set({
          merchant,
          note: sameMerchant ? state.note : '',
          rewardLineKey: sameMerchant ? state.rewardLineKey : null,
          scheduledFor: sameMerchant ? state.scheduledFor : null,
          group: sameMerchant ? state.group : null,
          lines: existing
            ? lines.map((l) =>
                l.key === key ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l,
              )
            : [...lines, { ...line, key }],
        });
        return true;
      },
      setQuantity: (key, quantity) =>
        set((state) => ({
          rewardLineKey: quantity <= 0 && state.rewardLineKey === key ? null : state.rewardLineKey,
          lines:
            quantity <= 0
              ? state.lines.filter((l) => l.key !== key)
              : state.lines.map((l) =>
                  l.key === key ? { ...l, quantity: Math.min(50, quantity) } : l,
                ),
        })),
      setLines: (lines) =>
        set((state) => ({
          lines,
          rewardLineKey: lines.some((l) => l.key === state.rewardLineKey)
            ? state.rewardLineKey
            : null,
        })),
      setNote: (note) => set({ note }),
      setRewardLine: (key) => set({ rewardLineKey: key }),
      setFulfillment: (fulfillment) => set({ fulfillment }),
      setDeliveryAddress: (deliveryAddress) => set({ deliveryAddress }),
      setDeliveryPhone: (deliveryPhone) => set({ deliveryPhone }),
      setDeliveryInstructions: (deliveryInstructions) => set({ deliveryInstructions }),
      // Une commande groupée est toujours programmée : décocher la précommande l'annule aussi.
      setScheduledFor: (scheduledFor) =>
        set((state) => ({ scheduledFor, group: scheduledFor ? state.group : null })),
      setGroup: (group) => set({ group }),
      clear: () =>
        set({
          merchant: null,
          lines: [],
          note: '',
          rewardLineKey: null,
          fulfillment: 'pickup',
          scheduledFor: null,
          group: null,
        }),
    }),
    {
      name: 'zeroo.cart',
      // localStorage est installé par expo-sqlite (mobile) ou fourni par le navigateur ;
      // absent dans Jest, où le panier reste simplement en mémoire.
      storage: createJSONStorage(() => globalThis.localStorage ?? memoryStorage),
    },
  ),
);
