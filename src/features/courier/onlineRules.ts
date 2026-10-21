import type { Courier } from './types';

/** Intervalle des signaux de présence ; la fenêtre côté serveur dure 15 minutes. */
export const HEARTBEAT_MS = 5 * 60_000;

type Availability = Pick<Courier, 'is_available' | 'available_until'>;

/**
 * Le livreur est-il en ligne à l'instant `now` ? Même règle que la base (`is_online`), recalculée
 * localement pour que l'interface passe hors ligne dès que la fenêtre expire, même sans réseau.
 */
export function isOnlineAt(courier: Availability, now: number): boolean {
  return (
    courier.is_available &&
    courier.available_until !== null &&
    new Date(courier.available_until).getTime() > now
  );
}
