import { normalizeTime } from '@/features/merchant/hours';
import { parsePriceToCents } from '@/lib/money';

import type { Allergen, Basket } from './types';

/** Données attendues par save_basket(). */
export type BasketInput = {
  title: string;
  contents: string | null;
  is_surprise: boolean;
  price_cents: number;
  estimated_value_cents: number | null;
  quantity_total: number;
  allergens: Allergen[];
  allergens_confirmed: boolean;
  pickup_starts_at: string;
  pickup_ends_at: string;
  is_active: boolean;
};

/** Saisies de l'écran d'édition d'un panier. */
export type BasketForm = {
  title: string;
  isSurprise: boolean;
  contents: string;
  price: string;
  value: string;
  quantity: string;
  allergens: Allergen[];
  allergensConfirmed: boolean;
  /** 0 = aujourd'hui, 1 = demain. */
  dayOffset: 0 | 1;
  start: string;
  end: string;
  active: boolean;
};

export type BasketErrorKey =
  'title' | 'contents' | 'price' | 'value' | 'quantity' | 'window' | 'allergens';

export const emptyBasketForm = (): BasketForm => ({
  title: '',
  isSurprise: true,
  contents: '',
  price: '',
  value: '',
  quantity: '5',
  allergens: [],
  allergensConfirmed: false,
  dayOffset: 0,
  start: '18:00',
  end: '19:30',
  active: true,
});

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Formulaire prérempli depuis un panier existant (jour relatif à `now`). */
export function basketToForm(basket: Basket, now: Date): BasketForm {
  const start = new Date(basket.pickup_starts_at);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return {
    title: basket.title,
    isSurprise: basket.is_surprise,
    contents: basket.contents ?? '',
    price: (basket.price_cents / 100).toFixed(2).replace('.', ','),
    value: basket.estimated_value_cents
      ? (basket.estimated_value_cents / 100).toFixed(2).replace('.', ',')
      : '',
    quantity: String(basket.quantity_total),
    allergens: basket.allergens as Allergen[],
    allergensConfirmed: basket.allergens_confirmed,
    dayOffset: startDay > today ? 1 : 0,
    start: hhmm(start),
    end: hhmm(new Date(basket.pickup_ends_at)),
    active: basket.is_active,
  };
}

/**
 * Créneau de retrait en dates réelles (heure de l'appareil, supposée celle du commerce) : si la fin est
 * avant le début, elle tombe le lendemain (ex. 23:00 → 00:30). `null` si une heure est invalide.
 */
export function pickupWindow(
  form: Pick<BasketForm, 'dayOffset' | 'start' | 'end'>,
  now: Date,
): { starts: Date; ends: Date } | null {
  const start = normalizeTime(form.start);
  const end = normalizeTime(form.end);
  if (!start || !end || start === end) return null;
  const at = (day: number, time: string) =>
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + day,
      Number(time.slice(0, 2)),
      Number(time.slice(3, 5)),
    );
  const starts = at(form.dayOffset, start);
  let ends = at(form.dayOffset, end);
  if (ends <= starts) ends = at(form.dayOffset + 1, end);
  return { starts, ends };
}

/** Vérifie le formulaire comme le fera le serveur (qui reste seul juge). */
export function validateBasket(
  form: BasketForm,
  now: Date,
): { ok: true; input: BasketInput } | { ok: false; errors: BasketErrorKey[] } {
  const errors = new Set<BasketErrorKey>();
  const title = form.title.trim();
  if (title.length < 1 || title.length > 60) errors.add('title');
  const contents = form.contents.trim();
  if (!form.isSurprise && (contents.length < 1 || contents.length > 300)) errors.add('contents');
  if (form.isSurprise && contents.length > 300) errors.add('contents');

  const price = parsePriceToCents(form.price);
  if (price === null || price < 100 || price > 20000) errors.add('price');
  const value = form.value.trim() ? parsePriceToCents(form.value) : null;
  if (form.value.trim() && (value === null || (price !== null && value < price)))
    errors.add('value');

  const quantity = Number(form.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) errors.add('quantity');

  const window = pickupWindow(form, now);
  const longest = 12 * 3600_000;
  if (!window || window.ends <= now || window.ends.getTime() - window.starts.getTime() > longest) {
    errors.add('window');
  }
  // Information allergènes : le commerçant certifie son exactitude pour proposer le panier.
  if (form.active && !form.allergensConfirmed) errors.add('allergens');

  if (errors.size > 0 || !window || price === null) return { ok: false, errors: [...errors] };
  return {
    ok: true,
    input: {
      title,
      contents: contents || null,
      is_surprise: form.isSurprise,
      price_cents: price,
      estimated_value_cents: value,
      quantity_total: quantity,
      allergens: form.allergens,
      allergens_confirmed: form.allergensConfirmed,
      pickup_starts_at: window.starts.toISOString(),
      pickup_ends_at: window.ends.toISOString(),
      is_active: form.active,
    },
  };
}
