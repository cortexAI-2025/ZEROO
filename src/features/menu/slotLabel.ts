import { describeWeekdays, groupSlots, type ItemSlot } from './slots';

/**
 * Libellé des heures de service d'un produit : « lun–sam 11:00–15:00 · dim 08:00–12:00 ».
 * `dayName(n)` donne le nom court du jour ISO n ; chaîne vide quand le produit n'a pas de créneau.
 */
export function slotsLabel(
  slots: readonly ItemSlot[],
  dayName: (weekday: number) => string,
  allDaysLabel: string,
): string {
  const names = [1, 2, 3, 4, 5, 6, 7].map(dayName);
  return groupSlots(slots)
    .map((g) => `${describeWeekdays(g.weekdays, names, allDaysLabel)} ${g.starts_at}–${g.ends_at}`)
    .join(' · ');
}
