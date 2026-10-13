import type { Tables } from '@/types/database';

export type MenuOption = Tables<'menu_options'>;
export type MenuOptionGroup = Tables<'menu_option_groups'> & { menu_options: MenuOption[] };
export type MenuItem = Tables<'menu_items'> & { menu_option_groups: MenuOptionGroup[] };
export type MenuCategory = Tables<'menu_categories'> & { menu_items: MenuItem[] };
