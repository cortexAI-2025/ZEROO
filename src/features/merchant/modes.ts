export type OrderMode = 'pickup' | 'delivery';

type ModeFlags = { offers_pickup: boolean; offers_delivery: boolean | null };

/**
 * Modes de commande proposés par un établissement, dans l'ordre d'affichage : le retrait
 * (click & collect) d'abord, puis la livraison. Reflet de `offers_pickup` et `offers_delivery`
 * calculés côté serveur, qui revérifie de toute façon à la commande.
 */
export function orderModes(flags: ModeFlags | null | undefined): OrderMode[] {
  if (!flags) return [];
  const modes: OrderMode[] = [];
  if (flags.offers_pickup) modes.push('pickup');
  if (flags.offers_delivery) modes.push('delivery');
  return modes;
}

/** Le mode souhaité s'il est proposé, sinon le premier mode proposé (`null` s'il n'y en a aucun). */
export function resolveMode(wanted: OrderMode, modes: OrderMode[]): OrderMode | null {
  if (modes.includes(wanted)) return wanted;
  return modes[0] ?? null;
}

/** L'adresse précise n'est montrée au public que par un établissement qui accueille des clients. */
export function showsAddress(flags: { offers_pickup: boolean } | null | undefined): boolean {
  return !!flags?.offers_pickup;
}
