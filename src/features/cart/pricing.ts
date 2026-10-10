import type { MenuItem } from '@/features/menu/types';

/**
 * Mêmes règles que create_order() côté serveur, appliquées dans l'app pour
 * guider le client. Le serveur reste seul juge du prix et de la validité.
 */

/** Options choisies, par groupe : { [groupId]: optionId[] } */
export type Selection = Record<string, string[]>;

export type GroupIssue = { groupId: string; kind: 'min' | 'max' };

export function selectionIssues(item: MenuItem, selection: Selection): GroupIssue[] {
  return item.menu_option_groups.flatMap((group): GroupIssue[] => {
    const count = selection[group.id]?.length ?? 0;
    if (count < group.min_select) return [{ groupId: group.id, kind: 'min' }];
    if (count > group.max_select) return [{ groupId: group.id, kind: 'max' }];
    return [];
  });
}

/**
 * Coche ou décoche une option. Pour un groupe à choix unique, cocher remplace
 * le choix précédent ; sinon on ne dépasse jamais le maximum.
 */
export function toggleOption(
  item: MenuItem,
  selection: Selection,
  groupId: string,
  optionId: string,
): Selection {
  const group = item.menu_option_groups.find((g) => g.id === groupId);
  if (!group) return selection;
  const current = selection[groupId] ?? [];
  if (current.includes(optionId)) {
    return { ...selection, [groupId]: current.filter((id) => id !== optionId) };
  }
  if (group.max_select === 1) return { ...selection, [groupId]: [optionId] };
  if (current.length >= group.max_select) return selection;
  return { ...selection, [groupId]: [...current, optionId] };
}

export type ChosenOption = { id: string; groupName: string; name: string; priceDeltaCents: number };

/** Options choisies, dans l'ordre du menu. */
export function chosenOptions(item: MenuItem, selection: Selection): ChosenOption[] {
  return item.menu_option_groups.flatMap((group) =>
    group.menu_options
      .filter((o) => selection[group.id]?.includes(o.id))
      .map((o) => ({
        id: o.id,
        groupName: group.name,
        name: o.name,
        priceDeltaCents: o.price_delta_cents,
      })),
  );
}

export function unitPriceCents(item: MenuItem, selection: Selection): number {
  return chosenOptions(item, selection).reduce(
    (sum, o) => sum + o.priceDeltaCents,
    item.price_cents,
  );
}
