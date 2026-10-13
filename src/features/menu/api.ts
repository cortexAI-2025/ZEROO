import { supabase } from '@/lib/supabase';
import type { TablesInsert, TablesUpdate } from '@/types/database';

import type { MenuCategory } from './types';

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

/** Menu complet d'un commerce, trié : catégories → produits → options. */
export async function fetchMenu(merchantId: string): Promise<MenuCategory[]> {
  const { data, error } = await supabase
    .from('menu_categories')
    .select('*, menu_items(*, menu_option_groups(*, menu_options(*)))')
    .eq('merchant_id', merchantId);
  if (error) throw error;

  return data.sort(byPosition).map((category) => ({
    ...category,
    menu_items: category.menu_items.sort(byPosition).map((item) => ({
      ...item,
      menu_option_groups: item.menu_option_groups.sort(byPosition).map((group) => ({
        ...group,
        menu_options: group.menu_options.sort(byPosition),
      })),
    })),
  }));
}

/** Position suivante dans une liste (ajout en fin de liste). */
export const nextPosition = (rows: { position: number }[]) =>
  rows.reduce((max, row) => Math.max(max, row.position + 1), 0);

export async function insertCategory(values: TablesInsert<'menu_categories'>) {
  const { error } = await supabase.from('menu_categories').insert(values);
  if (error) throw error;
}

export async function updateCategory(id: string, patch: TablesUpdate<'menu_categories'>) {
  const { error } = await supabase.from('menu_categories').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from('menu_categories').delete().eq('id', id);
  if (error) throw error;
}

export async function insertItem(values: TablesInsert<'menu_items'>) {
  const { data, error } = await supabase.from('menu_items').insert(values).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updateItem(id: string, patch: TablesUpdate<'menu_items'>) {
  const { error } = await supabase.from('menu_items').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteItem(id: string) {
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) throw error;
}

type Positioned = 'menu_categories' | 'menu_items';

/** Échange la position de deux lignes (boutons ↑ / ↓). */
export async function swapPositions(
  table: Positioned,
  a: { id: string; position: number },
  b: { id: string; position: number },
) {
  // Positions égales (lignes créées en même temps) : on les départage.
  const [posA, posB] =
    a.position === b.position ? [b.position + 1, a.position] : [b.position, a.position];
  const results = await Promise.all([
    supabase.from(table).update({ position: posA }).eq('id', a.id),
    supabase.from(table).update({ position: posB }).eq('id', b.id),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

export async function insertOptionGroup(values: TablesInsert<'menu_option_groups'>) {
  const { error } = await supabase.from('menu_option_groups').insert(values);
  if (error) throw error;
}

export async function updateOptionGroup(id: string, patch: TablesUpdate<'menu_option_groups'>) {
  const { error } = await supabase.from('menu_option_groups').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteOptionGroup(id: string) {
  const { error } = await supabase.from('menu_option_groups').delete().eq('id', id);
  if (error) throw error;
}

export async function insertOption(values: TablesInsert<'menu_options'>) {
  const { error } = await supabase.from('menu_options').insert(values);
  if (error) throw error;
}

export async function updateOption(id: string, patch: TablesUpdate<'menu_options'>) {
  const { error } = await supabase.from('menu_options').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteOption(id: string) {
  const { error } = await supabase.from('menu_options').delete().eq('id', id);
  if (error) throw error;
}
