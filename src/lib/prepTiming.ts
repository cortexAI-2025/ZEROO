/**
 * Conseil de préparation pour le commerçant à partir de l'heure d'arrivée du client :
 * la commande doit être prête à son arrivée, donc lancée `prepMinutes` avant.
 */
export type PrepAdvice =
  | { kind: 'start_now'; arrivesInMinutes: number }
  | { kind: 'start_later'; startInMinutes: number; arrivesInMinutes: number };

export function prepAdvice(
  etaIso: string,
  prepMinutes: number,
  now: number = Date.now(),
): PrepAdvice {
  const eta = Date.parse(etaIso);
  const arrivesInMinutes = Math.max(0, Math.round((eta - now) / 60_000));
  const startInMinutes = Math.round((eta - prepMinutes * 60_000 - now) / 60_000);
  return startInMinutes <= 0
    ? { kind: 'start_now', arrivesInMinutes }
    : { kind: 'start_later', startInMinutes, arrivesInMinutes };
}
