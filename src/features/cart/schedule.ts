import { type ZonedParts, zonedDay, zonedParts, zonedToInstant } from '@/lib/zone';

/**
 * Précommandes programmées : créneaux proposés au client. Même logique d'ouverture que la base
 * (`time_in_window` : une plage qui passe minuit déborde sur le lendemain), **dans le fuseau horaire de
 * l'établissement** (jamais celui de l'appareil). Le serveur revérifie toujours le créneau (horaires,
 * fermetures, créneaux de menu, délai de préparation).
 */
export type HoursRow = { weekday: number; opens_at: string; closes_at: string };
export type ClosureRow = { starts_at: string; ends_at: string };

export const STEP_MINUTES = 15;
export const MAX_DAYS_AHEAD = 14;

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** Cette plage couvre-t-elle (jour, minutes depuis minuit) ? Voir time_in_window en base. */
function inWindow(row: HoursRow, weekday: number, minutes: number) {
  const opens = toMinutes(row.opens_at);
  const closes = toMinutes(row.closes_at);
  if (closes > opens) return row.weekday === weekday && minutes >= opens && minutes < closes;
  const next = (row.weekday % 7) + 1;
  return (row.weekday === weekday && minutes >= opens) || (next === weekday && minutes < closes);
}

export function isOpenAt(hours: HoursRow[], closures: ClosureRow[], date: Date, timeZone: string) {
  const p: ZonedParts = zonedParts(date, timeZone);
  if (!hours.some((h) => inWindow(h, p.weekday, p.hour * 60 + p.minute))) return false;
  const ts = date.getTime();
  return !closures.some((c) => ts >= Date.parse(c.starts_at) && ts < Date.parse(c.ends_at));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Jour calendaire (AAAA-MM-JJ) décalé de `offset` jours, par arithmétique pure sur la date. */
function addDays(day: string, offset: number) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + offset));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export type ScheduleDay = { day: string; times: string[] };

/** Créneaux de 15 minutes sur 14 jours : ouverts, hors fermeture, après le délai minimal. */
export function scheduleOptions(input: {
  hours: HoursRow[];
  closures: ClosureRow[];
  now: Date;
  leadMinutes: number;
  timeZone: string;
  maxDays?: number;
}): ScheduleDay[] {
  const { hours, closures, now, leadMinutes, timeZone } = input;
  const maxDays = input.maxDays ?? MAX_DAYS_AHEAD;
  const earliest = now.getTime() + leadMinutes * 60_000;
  const horizon = now.getTime() + maxDays * 86_400_000;
  const today = zonedDay(now, timeZone);
  const days: ScheduleDay[] = [];
  for (let d = 0; d <= maxDays; d++) {
    const day = addDays(today, d);
    const times: string[] = [];
    for (let m = 0; m < 24 * 60; m += STEP_MINUTES) {
      const time = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      const slot = zonedToInstant(day, time, timeZone);
      if (!slot || slot.getTime() < earliest || slot.getTime() > horizon) continue;
      if (isOpenAt(hours, closures, slot, timeZone)) times.push(time);
    }
    if (times.length > 0) days.push({ day, times });
  }
  return days;
}

/** « 2026-10-22 » + « 12:30 » (heure de l'établissement) → instant ISO, ou null si cette heure n'existe pas. */
export function slotToIso(day: string, time: string, timeZone: string): string | null {
  return zonedToInstant(day, time, timeZone)?.toISOString() ?? null;
}

/** Instant ISO → jour et heure de l'établissement (inverse de slotToIso). */
export function isoToSlot(iso: string, timeZone: string) {
  const p = zonedParts(new Date(iso), timeZone);
  return { day: zonedDay(new Date(iso), timeZone), time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** Délai minimal d'une précommande (même règle que scheduled_min_lead_minutes en base). */
export const scheduleLeadMinutes = (defaultPrepMinutes: number) =>
  Math.max(defaultPrepMinutes, 15) + 15;

/** Commande groupée : délai minimal fixé par l'établissement (en heures). */
export const groupLeadMinutes = (hours: number) => hours * 60;
