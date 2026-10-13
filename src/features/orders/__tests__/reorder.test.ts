import type { MenuCategory } from '@/features/menu/types';

import { rebuildLines } from '../reorder';

const menu = [
  {
    id: 'c1',
    menu_items: [
      {
        id: 'kebab',
        name: 'Kebab',
        price_cents: 850,
        is_available: true,
        is_loyalty_menu: false,
        menu_option_groups: [
          {
            id: 'g1',
            name: 'Sauce',
            min_select: 1,
            max_select: 1,
            menu_options: [
              { id: 'o1', name: 'Blanche', price_delta_cents: 0 },
              { id: 'o2', name: 'Harissa', price_delta_cents: 50 },
            ],
          },
        ],
      },
      {
        id: 'frites',
        name: 'Frites',
        price_cents: 300,
        is_available: false,
        is_loyalty_menu: false,
        menu_option_groups: [],
      },
    ],
  },
] as unknown as MenuCategory[];

describe('rebuildLines', () => {
  it('reprend les produits et options encore à la carte, aux prix actuels', () => {
    const { lines, skipped } = rebuildLines(
      [{ menu_item_id: 'kebab', quantity: 2, options: [{ group: 'Sauce', name: 'Harissa' }] }],
      menu,
    );
    expect(skipped).toBe(0);
    expect(lines).toEqual([
      expect.objectContaining({ itemId: 'kebab', quantity: 2, unitPriceCents: 900 }),
    ]);
  });

  it('écarte les produits en rupture, supprimés ou sans option obligatoire', () => {
    const { lines, skipped } = rebuildLines(
      [
        { menu_item_id: 'frites', quantity: 1, options: [] },
        { menu_item_id: null, quantity: 1, options: [] },
        { menu_item_id: 'kebab', quantity: 1, options: [] },
        { menu_item_id: 'kebab', quantity: 1, options: [{ group: 'Sauce', name: 'Samouraï' }] },
      ],
      menu,
    );
    expect(lines).toHaveLength(0);
    expect(skipped).toBe(4);
  });
});
