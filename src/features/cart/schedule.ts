/**
 * Précommandes programmées : créneaux proposés au client. Même logique d'ouverture que la base
 * (`time_in_window` : une plage qui passe minuit déborde sur le lendemain) ; le serveur revérifie
 * toujours le créneau (horaires, fermetures, délai de préparation). Heure de l'appareil, supposée
 * être celle de l'établissement (Europe/Paris).
 */
export type HoursRow = { weekday: number; opens_at: string; closes_at: string };
export type ClosureRow = { starts_at: string; ends_at: string };

export const STEP_MINUTES = 15;
export const MAX_DAYS_AHEAD = 14;

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** Jour ISO : 1 = lundi … 7 = dimanche. */
const isoWeekday = (date: Date) => ((date.getDay() + 6) % 7) + 1;

/** Cette plage couvre-t-elle (jour, minutes depuis minuit) ? Voir time_in_window en base. */
function inWindow(row: HoursRow, weekday: number, minutes: number) {
  const opens = toMinutes(row.opens_at);
  const closes = toMinutes(row.closes_at);
  if (closes > opens) return row.weekday === weekday && minutes >= opens && minutes < closes;
  const next = (row.weekday % 7) + 1;
  return (row.weekday === weekday && minutes >= opens) || (next === weekday && minutes < closes);
}

export function isOpenAt(hours: HoursRow[], closures: ClosureRow[], date: Date) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const weekday = isoWeekday(date);
  if (!hours.some((h) => inWindow(h, weekday, minutes))) return false;
  const ts = date.getTime();
  return !closures.some((c) => ts >= Date.parse(c.starts_at) && ts < Date.parse(c.ends_at));
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export type ScheduleDay = { day: string; times: string[] };

/** Créneaux de 15 minutes sur 14 jours : ouverts, hors fermeture, après le délai minimal. */
export function scheduleOptions(input: {
  hours: HoursRow[];
  closures: ClosureRow[];
  now: Date;
  leadMinutes: number;
  maxDays?: number;
}): ScheduleDay[] {
  const { hours, closures, now, leadMinutes } = input;
  const earliest = now.getTime() + leadMinutes * 60_000;
  const horizon = now.getTime() + (input.maxDays ?? MAX_DAYS_AHEAD) * 86_400_000;
  const days: ScheduleDay[] = [];
  for (let d = 0; d <= (input.maxDays ?? MAX_DAYS_AHEAD); d++) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    const times: string[] = [];
    for (let m = 0; m < 24 * 60; m += STEP_MINUTES) {
      const slot = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, m);
      if (slot.getTime() < earliest || slot.getTime() > horizon) continue;
      if (isOpenAt(hours, closures, slot))
        times.push(`${pad(slot.getHours())}:${pad(slot.getMinutes())}`);
    }
    if (times.length > 0) days.push({ day: dayKey(base), times });
  }
  return days;
}

/** « 2026-10-22 » + « 12:30 » → instant ISO (heure locale de l'appareil). */
export function slotToIso(day: string, time: string) {
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi).toISOString();
}

/** Délai minimal d'une précommande (même règle que scheduled_min_lead_minutes en base). */
export const scheduleLeadMinutes = (defaultPrepMinutes: number) =>
  Math.max(defaultPrepMinutes, 15) + 15;

/** Commande groupée : délai minimal fixé par l'établissement (en heures). */
export const groupLeadMinutes = (hours: number) => hours * 60;

/** Instant ISO → jour et heure locale (inverse de slotToIso). */
export function isoToSlot(iso: string) {
  const date = new Date(iso);
  return { day: dayKey(date), time: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
}
