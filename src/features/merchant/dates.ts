/**
 * Date saisie en français : « 24/12/2026 », « 24-12-2026 » ou « 24.12.26 » → « 2026-12-24 »
 * (format attendu par la base) ; null si elle n'existe pas au calendrier.
 */
export function parseFrenchDate(input: string): string | null {
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(input.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!valid) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** « 2026-12-24 » → « 24/12/2026 » (affichage). */
export function formatFrenchDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}
