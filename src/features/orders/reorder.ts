import type { ChosenOption } from '@/features/cart/pricing';
import type { CartLine } from '@/features/cart/store';
import type { MenuCategory } from '@/features/menu/types';

type PastItem = {
  menu_item_id: string | null;
  quantity: number;
  options: readonly { group: string; name: string }[];
};

/**
 * Recompose les lignes d'une ancienne commande avec la carte actuelle du restaurant : les
 * produits retirés ou en rupture, ou dont une option n'existe plus, sont écartés. Les prix
 * sont ceux d'aujourd'hui.
 */
export function rebuildLines(
  items: PastItem[],
  menu: MenuCategory[],
): { lines: Omit<CartLine, 'key'>[]; skipped: number } {
  const byId = new Map(menu.flatMap((c) => c.menu_items).map((i) => [i.id, i]));
  const lines: Omit<CartLine, 'key'>[] = [];
  let skipped = 0;
  for (const past of items) {
    const item = past.menu_item_id ? byId.get(past.menu_item_id) : undefined;
    if (!item || !item.is_available || item.is_in_slot_now === false) {
      skipped += 1;
      continue;
    }
    const wanted = past.options;
    const options: ChosenOption[] = [];
    let missing = false;
    for (const w of wanted) {
      const group = item.menu_option_groups.find((g) => g.name === w.group);
      const option = group?.menu_options.find((o) => o.name === w.name);
      if (!group || !option) {
        missing = true;
        break;
      }
      options.push({
        id: option.id,
        groupName: group.name,
        name: option.name,
        priceDeltaCents: option.price_delta_cents,
      });
    }
    // Un groupe obligatoire sans choix rendrait la ligne invalide : on l'écarte aussi.
    const incomplete = item.menu_option_groups.some(
      (g) => options.filter((o) => o.groupName === g.name).length < g.min_select,
    );
    if (missing || incomplete) {
      skipped += 1;
      continue;
    }
    lines.push({
      itemId: item.id,
      name: item.name,
      quantity: past.quantity,
      options,
      isLoyaltyMenu: item.is_loyalty_menu,
      basePriceCents: item.price_cents,
      unitPriceCents: options.reduce((sum, o) => sum + o.priceDeltaCents, item.price_cents),
    });
  }
  return { lines, skipped };
}
