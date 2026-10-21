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
        is_in_slot_now: true,
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

describe('rebuildLines : ce qui est signalé au client', () => {
  it('signale chaque produit écarté avec sa raison', () => {
    const slotMenu = JSON.parse(JSON.stringify(menu)) as MenuCategory[];
    slotMenu[0].menu_items[0].is_in_slot_now = false;
    const { issues } = rebuildLines(
      [
        { menu_item_id: 'frites', name: 'Frites', quantity: 1, options: [] },
        { menu_item_id: null, name: 'Ancien menu', quantity: 1, options: [] },
        {
          menu_item_id: 'kebab',
          name: 'Kebab',
          quantity: 1,
          options: [{ group: 'Sauce', name: 'Blanche' }],
        },
      ],
      slotMenu,
    );
    expect(issues).toEqual([
      { name: 'Frites', reason: 'unavailable' },
      { name: 'Ancien menu', reason: 'unavailable' },
      { name: 'Kebab', reason: 'out_of_slot' },
    ]);
  });

  it('signale une option disparue', () => {
    const { issues } = rebuildLines(
      [
        {
          menu_item_id: 'kebab',
          name: 'Kebab',
          quantity: 1,
          options: [{ group: 'Sauce', name: 'Samouraï' }],
        },
      ],
      menu,
    );
    expect(issues).toEqual([{ name: 'Kebab', reason: 'option_missing' }]);
  });

  it('signale un prix modifié, en comparant au tarif habituel d’alors', () => {
    const { lines, issues } = rebuildLines(
      [
        {
          menu_item_id: 'kebab',
          name: 'Kebab',
          quantity: 1,
          options: [{ group: 'Sauce', name: 'Blanche' }],
          unit_price_cents: 700, // payé en Happy Hour
          regular_unit_cents: 800, // tarif habituel d'alors
        },
      ],
      menu,
    );
    expect(lines[0].unitPriceCents).toBe(850);
    expect(issues).toEqual([
      { name: 'Kebab', reason: 'price_changed', fromCents: 800, toCents: 850 },
    ]);
  });

  it('ne signale rien quand seul le prix payé (promotion) diffère du tarif habituel actuel', () => {
    const { issues } = rebuildLines(
      [
        {
          menu_item_id: 'kebab',
          name: 'Kebab',
          quantity: 1,
          options: [{ group: 'Sauce', name: 'Blanche' }],
          unit_price_cents: 680,
          regular_unit_cents: 850,
        },
      ],
      menu,
    );
    expect(issues).toEqual([]);
  });

  it('ne reprend jamais une promotion expirée : le prix repris est le tarif habituel actuel', () => {
    const { lines } = rebuildLines(
      [
        {
          menu_item_id: 'kebab',
          quantity: 1,
          options: [{ group: 'Sauce', name: 'Blanche' }],
          unit_price_cents: 680,
          regular_unit_cents: 850,
        },
      ],
      menu,
    );
    expect(lines[0].unitPriceCents).toBe(850);
  });

  it('fusionne une ligne vendue en partie en promotion (deux lignes en base)', () => {
    const { lines } = rebuildLines(
      [
        {
          menu_item_id: 'kebab',
          quantity: 1,
          options: [{ group: 'Sauce', name: 'Blanche' }],
          unit_price_cents: 680,
          regular_unit_cents: 850,
        },
        {
          menu_item_id: 'kebab',
          quantity: 2,
          options: [{ group: 'Sauce', name: 'Blanche' }],
          unit_price_cents: 850,
        },
      ],
      menu,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(3);
  });
});
