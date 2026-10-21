import type { ChosenOption } from '@/features/cart/pricing';
import type { CartLine } from '@/features/cart/store';
import type { MenuCategory } from '@/features/menu/types';

type PastItem = {
  menu_item_id: string | null;
  name?: string;
  quantity: number;
  options: readonly { group: string; name: string }[];
  /** Prix payé et tarif habituel d'alors (le prix payé peut être celui d'une Happy Hour). */
  unit_price_cents?: number;
  regular_unit_cents?: number | null;
};

/** Pourquoi une ligne de l'ancienne commande n'a pas été reprise telle quelle. */
export type ReorderIssue = {
  name: string;
  reason: 'unavailable' | 'out_of_slot' | 'option_missing' | 'price_changed';
  fromCents?: number;
  toCents?: number;
};

const sameLine = (a: PastItem, b: PastItem) =>
  a.menu_item_id === b.menu_item_id &&
  [...a.options]
    .map((o) => `${o.group}|${o.name}`)
    .sort()
    .join(';') ===
    [...b.options]
      .map((o) => `${o.group}|${o.name}`)
      .sort()
      .join(';');

/** Regroupe les lignes identiques (une ligne vendue en partie en Happy Hour est stockée en deux). */
function mergePast(items: PastItem[]): PastItem[] {
  const merged: PastItem[] = [];
  for (const item of items) {
    const existing = merged.find((m) => sameLine(m, item));
    if (existing) existing.quantity += item.quantity;
    else merged.push({ ...item });
  }
  return merged;
}

/**
 * Recompose les lignes d'une ancienne commande avec la carte actuelle du restaurant :
 *  - les produits retirés, en rupture, hors de leur créneau ou dont une option n'existe plus sont
 *    écartés et signalés ;
 *  - les prix sont ceux d'aujourd'hui (tarif habituel) ; un prix qui a changé est signalé ;
 *  - une promotion passée n'est jamais reprise : l'offre en vigueur s'applique ensuite au panier.
 * Rien n'est payé ni envoyé : le client relit son panier.
 */
export function rebuildLines(
  items: PastItem[],
  menu: MenuCategory[],
): { lines: Omit<CartLine, 'key'>[]; skipped: number; issues: ReorderIssue[] } {
  const byId = new Map(menu.flatMap((c) => c.menu_items).map((i) => [i.id, i]));
  const lines: Omit<CartLine, 'key'>[] = [];
  const issues: ReorderIssue[] = [];
  let skipped = 0;
  for (const past of mergePast(items)) {
    const item = past.menu_item_id ? byId.get(past.menu_item_id) : undefined;
    const name = past.name ?? item?.name ?? '';
    if (!item || !item.is_available) {
      skipped += 1;
      issues.push({ name, reason: 'unavailable' });
      continue;
    }
    if (item.is_in_slot_now === false) {
      skipped += 1;
      issues.push({ name, reason: 'out_of_slot' });
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
      issues.push({ name, reason: 'option_missing' });
      continue;
    }
    const unitPriceCents = options.reduce((sum, o) => sum + o.priceDeltaCents, item.price_cents);
    const before = past.regular_unit_cents ?? past.unit_price_cents;
    if (before !== undefined && before !== unitPriceCents) {
      issues.push({ name, reason: 'price_changed', fromCents: before, toCents: unitPriceCents });
    }
    lines.push({
      itemId: item.id,
      name: item.name,
      quantity: past.quantity,
      options,
      isLoyaltyMenu: item.is_loyalty_menu,
      basePriceCents: item.price_cents,
      unitPriceCents,
    });
  }
  return { lines, skipped, issues };
}
