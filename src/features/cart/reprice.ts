import type { MenuCategory } from '@/features/menu/types';

import type { CartLine } from './store';

export type RepriceResult = {
  lines: CartLine[];
  /** Produits retirés du panier (supprimés, en rupture, hors créneau ou option disparue). */
  removed: string[];
  /** Produits dont le prix habituel a changé. */
  changed: string[];
};

/**
 * Remet les lignes du panier au prix de la carte actuelle du commerce. Utilisé quand le serveur
 * signale qu'un prix a changé : le client relit son panier avant de valider de nouveau.
 * Les offres Happy Hour ne sont pas ici (elles viennent de `active_happy_hours`).
 */
export function repriceLines(
  lines: readonly CartLine[],
  menu: readonly MenuCategory[],
): RepriceResult {
  const items = new Map(menu.flatMap((c) => c.menu_items).map((i) => [i.id, i]));
  const result: CartLine[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const line of lines) {
    const item = items.get(line.itemId);
    const options = item?.menu_option_groups.flatMap((g) => g.menu_options) ?? [];
    const stillThere = line.options.every((o) => options.some((x) => x.id === o.id));
    if (!item || !item.is_available || item.is_in_slot_now === false || !stillThere) {
      removed.push(line.name);
      continue;
    }
    const chosen = line.options.map((o) => ({
      ...o,
      priceDeltaCents: options.find((x) => x.id === o.id)!.price_delta_cents,
    }));
    const unitPriceCents = chosen.reduce((sum, o) => sum + o.priceDeltaCents, item.price_cents);
    if (unitPriceCents !== line.unitPriceCents) changed.push(item.name);
    result.push({
      ...line,
      name: item.name,
      options: chosen,
      unitPriceCents,
      basePriceCents: item.price_cents,
      isLoyaltyMenu: item.is_loyalty_menu,
    });
  }
  return { lines: result, removed, changed };
}
