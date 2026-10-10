/** « 2026-10-08T12:34:00Z » → « 14:34 » (heure locale de l'appareil). */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** « 2026-10-08T12:34:00Z » → « jeudi 8 octobre ». */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
