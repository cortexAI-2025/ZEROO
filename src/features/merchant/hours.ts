/** Créneau d'ouverture tel que saisi dans l'écran des horaires. */
export type Slot = { weekday: number; opensAt: string; closesAt: string };

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const; // ISO : 1 = lundi

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** « 9:5 », « 9h30 », « 0930 » → « 09:05 », « 09:30 » ; null si invalide. */
export function normalizeTime(input: string): string | null {
  const cleaned = input.trim().toLowerCase().replace('h', ':');
  const match = /^(\d{1,2}):?(\d{0,2})$/.exec(
    cleaned.includes(':') ? cleaned : cleaned.replace(/^(\d{1,2})(\d{2})$/, '$1:$2'),
  );
  if (!match) return null;
  const hours = match[1].padStart(2, '0');
  const minutes = (match[2] || '0').padStart(2, '0');
  const value = `${hours}:${minutes}`;
  return TIME.test(value) ? value : null;
}

/** Vérifie et normalise les créneaux ; renvoie l'index du premier créneau invalide. */
export function validateSlots(
  slots: Slot[],
): { ok: true; slots: Slot[] } | { ok: false; index: number } {
  const normalized: Slot[] = [];
  for (const [index, slot] of slots.entries()) {
    const opensAt = normalizeTime(slot.opensAt);
    const closesAt = normalizeTime(slot.closesAt);
    if (!opensAt || !closesAt || opensAt === closesAt) return { ok: false, index };
    normalized.push({ weekday: slot.weekday, opensAt, closesAt });
  }
  return { ok: true, slots: normalized };
}

/** « 09:00:00 » (format Postgres) → « 09:00 ». */
export const shortTime = (time: string) => time.slice(0, 5);
