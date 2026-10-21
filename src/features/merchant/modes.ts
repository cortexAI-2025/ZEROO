export type OrderMode = 'pickup' | 'delivery';

type ModeFlags = {
  offers_pickup: boolean;
  /** Livraison activée par l'établissement et incluse dans sa formule (Pro). */
  offers_delivery: boolean | null;
  /** ... et au moins un livreur rattaché, en ligne, avec de la capacité. */
  delivery_available_now: boolean | null;
};

/**
 * Modes de commande proposés au client, dans l'ordre d'affichage : le retrait (click & collect)
 * d'abord, puis la livraison, seulement si un livreur peut la prendre maintenant. Reflet de
 * colonnes calculées côté serveur, qui revérifie de toute façon à la commande.
 */
export function orderModes(
  flags: ModeFlags | null | undefined,
  /** Précommande : la livraison n'exige pas de livreur en ligne maintenant (revérifié par le serveur). */
  scheduled = false,
): OrderMode[] {
  if (!flags) return [];
  const modes: OrderMode[] = [];
  if (flags.offers_pickup) modes.push('pickup');
  if (scheduled ? flags.offers_delivery : flags.delivery_available_now) modes.push('delivery');
  return modes;
}

/** La livraison existe mais aucun livreur ne peut la prendre pour l'instant. */
export function deliveryPausedNow(flags: ModeFlags | null | undefined): boolean {
  return !!flags?.offers_delivery && !flags.delivery_available_now;
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
