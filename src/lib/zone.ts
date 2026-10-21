/**
 * Heures « de l'établissement » : tout ce qui concerne une précommande (créneaux proposés, affichage)
 * se lit dans le fuseau horaire de l'établissement (`merchants.timezone`, ex. Europe/Paris), jamais dans
 * celui de l'appareil. Même convention que la base de données.
 */
export const DEFAULT_TIMEZONE = 'Europe/Paris';

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** ISO : 1 = lundi … 7 = dimanche. */
  weekday: number;
};

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const get: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(date)) get[p.type] = p.value;
  return {
    year: Number(get.year),
    month: Number(get.month),
    day: Number(get.day),
    hour: Number(get.hour),
    minute: Number(get.minute),
    weekday: WEEKDAYS[get.weekday],
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** « 2026-10-22 » : le jour calendaire de l'instant, dans le fuseau donné. */
export function zonedDay(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Décalage du fuseau à cet instant, en minutes (Paris l'été : +120). */
function offsetMinutes(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(date.getTime() / 60_000) * 60_000) / 60_000);
}

/**
 * Instant correspondant à « jour + heure » lus dans le fuseau donné. Renvoie null pour une heure
 * qui n'existe pas (saut d'heure du printemps).
 */
export function zonedToInstant(day: string, time: string, timeZone: string): Date | null {
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wanted = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wanted;
  for (let i = 0; i < 3; i++) guess = wanted - offsetMinutes(new Date(guess), timeZone) * 60_000;
  const result = new Date(guess);
  const p = zonedParts(result, timeZone);
  return p.hour === h && p.minute === mi && p.day === d ? result : null;
}

export function formatTimeIn(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
}

export function formatDayIn(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  });
}

export function formatDateTimeIn(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
}
