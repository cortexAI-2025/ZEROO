import { WEEKDAYS } from '@/features/merchant/hours';

/** Moments de consommation proposés au professionnel (et filtrés par les clients). */
export const MEAL_PERIODS = ['breakfast', 'lunch', 'dinner', 'night'] as const;
export type MealPeriod = (typeof MEAL_PERIODS)[number];

/** Créneaux types d'un moment de repas ; « night » passe minuit. */
export const MEAL_PERIOD_WINDOWS: Record<MealPeriod, { start: string; end: string }> = {
  breakfast: { start: '06:00', end: '11:00' },
  lunch: { start: '11:00', end: '15:00' },
  dinner: { start: '18:00', end: '23:00' },
  night: { start: '22:00', end: '04:00' },
};

/** Créneau de disponibilité d'un produit (heures « HH:MM », jour ISO, 1 = lundi). */
export type ItemSlot = { weekday: number; starts_at: string; ends_at: string };

const DAY = 24 * 60;
const WEEK = 7 * DAY;

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Créneaux types des moments choisis, pour les jours donnés (tous les jours par défaut). */
export function slotsForPeriods(
  periods: readonly MealPeriod[],
  weekdays: readonly number[] = WEEKDAYS,
): ItemSlot[] {
  return periods.flatMap((period) =>
    weekdays.map((weekday) => ({
      weekday,
      starts_at: MEAL_PERIOD_WINDOWS[period].start,
      ends_at: MEAL_PERIOD_WINDOWS[period].end,
    })),
  );
}

/** Intervalles [début, fin) sur la semaine (minutes depuis lundi 00:00), passage de minuit compris. */
function weekRanges(weekday: number, start: string, end: string): [number, number][] {
  const base = (weekday - 1) * DAY;
  const from = base + minutes(start);
  const to = base + minutes(end);
  if (from < to) return [[from, to]];
  // Passe minuit : la fin tombe le lendemain ; celle du dimanche déborde sur le lundi.
  const nextDayEnd = to + DAY;
  if (nextDayEnd <= WEEK) return [[from, nextDayEnd]];
  return [
    [from, WEEK],
    [0, nextDayEnd - WEEK],
  ];
}

/**
 * Le créneau d'un produit recoupe-t-il au moins une plage d'ouverture ? Sinon le produit ne serait
 * jamais commandable : l'écran d'édition prévient le professionnel.
 */
export function slotWithinOpening(
  slot: ItemSlot,
  hours: readonly { weekday: number; opens_at: string; closes_at: string }[],
): boolean {
  const slotRanges = weekRanges(slot.weekday, slot.starts_at, slot.ends_at);
  return hours.some((h) =>
    weekRanges(h.weekday, h.opens_at, h.closes_at).some(([a, b]) =>
      slotRanges.some(([c, d]) => a < d && c < b),
    ),
  );
}

/** Regroupe les jours qui partagent la même plage : « Lun–Sam 11:00–15:00 ». */
export function groupSlots(
  slots: readonly ItemSlot[],
): { weekdays: number[]; starts_at: string; ends_at: string }[] {
  const groups = new Map<string, { weekdays: number[]; starts_at: string; ends_at: string }>();
  for (const slot of [...slots].sort((a, b) => a.weekday - b.weekday)) {
    const starts_at = slot.starts_at.slice(0, 5);
    const ends_at = slot.ends_at.slice(0, 5);
    const key = `${starts_at}-${ends_at}`;
    const group = groups.get(key) ?? { weekdays: [], starts_at, ends_at };
    group.weekdays.push(slot.weekday);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** Libellé court d'une suite de jours : « tous les jours », « lun–sam » ou « lun, mer, ven ». */
export function describeWeekdays(
  weekdays: readonly number[],
  names: readonly string[],
  allDaysLabel: string,
): string {
  const days = [...new Set(weekdays)].sort((a, b) => a - b);
  if (days.length === 7) return allDaysLabel;
  const consecutive = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  if (days.length > 2 && consecutive) {
    return `${names[days[0] - 1]}–${names[days[days.length - 1] - 1]}`;
  }
  return days.map((d) => names[d - 1]).join(', ');
}
