import { groupSlots } from '@/features/menu/slots';
import { parseFrenchDate } from '@/features/merchant/dates';
import { normalizeTime } from '@/features/merchant/hours';
import { parsePriceToCents } from '@/lib/money';

import type { HappyHour, HappyHourInput } from './api';

/** Une plage hebdomadaire : les jours cochés partagent les mêmes heures (la fin peut passer minuit). */
export type WindowForm = { weekdays: number[]; start: string; end: string };

/** État de l'écran d'édition d'une offre (saisies telles que tapées). */
export type HappyHourForm = {
  name: string;
  discountType: 'percent' | 'price';
  percent: string;
  windows: WindowForm[];
  validFrom: string;
  validTo: string;
  quantity: string;
  pickup: boolean;
  delivery: boolean;
  itemIds: string[];
  /** Prix promotionnel saisi par produit (offre « prix »). */
  prices: Record<string, string>;
  active: boolean;
};

export type FormErrorKey =
  'name' | 'percent' | 'windows' | 'validity' | 'quantity' | 'modes' | 'items' | 'prices';

export const emptyForm = (): HappyHourForm => ({
  name: '',
  discountType: 'percent',
  percent: '20',
  windows: [{ weekdays: [1, 2, 3, 4, 5], start: '17:00', end: '19:00' }],
  validFrom: '',
  validTo: '',
  quantity: '',
  pickup: true,
  delivery: true,
  itemIds: [],
  prices: {},
  active: true,
});

const toFrench = (iso: string | null) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';

/** Formulaire prérempli depuis une offre existante (plages regroupées par heures identiques). */
export function formFromOffer(offer: HappyHour): HappyHourForm {
  return {
    name: offer.name,
    discountType: offer.discount_type === 'price' ? 'price' : 'percent',
    percent: offer.percent_off ? String(offer.percent_off) : '20',
    windows: groupSlots(offer.happy_hour_slots).map((g) => ({
      weekdays: g.weekdays,
      start: g.starts_at,
      end: g.ends_at,
    })),
    validFrom: toFrench(offer.starts_on),
    validTo: toFrench(offer.ends_on),
    quantity: offer.quantity_limit ? String(offer.quantity_limit) : '',
    pickup: offer.applies_to_pickup,
    delivery: offer.applies_to_delivery,
    itemIds: offer.happy_hour_items.map((i) => i.item_id),
    prices: Object.fromEntries(
      offer.happy_hour_items
        .filter((i) => i.promo_price_cents !== null)
        .map((i) => [i.item_id, ((i.promo_price_cents ?? 0) / 100).toFixed(2).replace('.', ',')]),
    ),
    active: offer.is_active,
  };
}

/**
 * Vérifie le formulaire comme le fera le serveur (qui reste seul juge) et produit les données à
 * envoyer. `catalog` donne le tarif habituel de chaque produit : une offre « prix » doit être
 * une vraie réduction.
 */
export function validateForm(
  form: HappyHourForm,
  catalog: ReadonlyMap<string, { price_cents: number }>,
): { ok: true; input: HappyHourInput } | { ok: false; errors: FormErrorKey[] } {
  const errors = new Set<FormErrorKey>();

  const name = form.name.trim();
  if (name.length < 1 || name.length > 60) errors.add('name');

  const percent = Number(form.percent);
  const percentValid = Number.isInteger(percent) && percent >= 1 && percent <= 90;
  if (form.discountType === 'percent' && !percentValid) errors.add('percent');

  const slots: HappyHourInput['slots'] = [];
  if (form.windows.length === 0) errors.add('windows');
  for (const w of form.windows) {
    const start = normalizeTime(w.start);
    const end = normalizeTime(w.end);
    if (!start || !end || start === end || w.weekdays.length === 0) {
      errors.add('windows');
      continue;
    }
    for (const weekday of w.weekdays) slots.push({ weekday, starts_at: start, ends_at: end });
  }

  const from = form.validFrom.trim() ? parseFrenchDate(form.validFrom) : null;
  const to = form.validTo.trim() ? parseFrenchDate(form.validTo) : null;
  if (
    (form.validFrom.trim() && !from) ||
    (form.validTo.trim() && !to) ||
    (from && to && to < from)
  ) {
    errors.add('validity');
  }

  const quantity = form.quantity.trim() ? Number(form.quantity) : null;
  if (quantity !== null && !(Number.isInteger(quantity) && quantity >= 1 && quantity <= 100000)) {
    errors.add('quantity');
  }

  if (!form.pickup && !form.delivery) errors.add('modes');
  if (form.itemIds.length === 0) errors.add('items');

  const items: HappyHourInput['items'] = [];
  for (const itemId of form.itemIds) {
    if (form.discountType !== 'price') {
      items.push({ item_id: itemId, promo_price_cents: null });
      continue;
    }
    const cents = parsePriceToCents(form.prices[itemId] ?? '');
    const regular = catalog.get(itemId)?.price_cents;
    if (cents === null || regular === undefined || cents >= regular) errors.add('prices');
    else items.push({ item_id: itemId, promo_price_cents: cents });
  }

  if (errors.size > 0) return { ok: false, errors: [...errors] };
  return {
    ok: true,
    input: {
      name,
      discount_type: form.discountType,
      percent_off: form.discountType === 'percent' ? percent : null,
      starts_on: from,
      ends_on: to,
      applies_to_pickup: form.pickup,
      applies_to_delivery: form.delivery,
      quantity_limit: quantity,
      is_active: form.active,
      slots,
      items,
    },
  };
}
