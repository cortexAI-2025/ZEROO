import type { MenuCategory } from '@/features/menu/types';

import { repriceLines } from '../reprice';
import type { CartLine } from '../store';

const option = (id: string, name: string, price_delta_cents = 0) => ({
  id,
  name,
  price_delta_cents,
  group_id: 'g',
  position: 0,
  is_available: true,
  merchant_id: 'm',
});

const menu = (price: number, extra = 100, available = true, inSlot: boolean | null = true) =>
  [
    {
      id: 'c',
      menu_items: [
        {
          id: 'tacos',
          name: 'Menu Tacos',
          price_cents: price,
          is_available: available,
          is_in_slot_now: inSlot,
          is_loyalty_menu: true,
          menu_option_groups: [
            { id: 'g', menu_options: [option('bla', 'Blanche'), option('ched', 'Cheddar', extra)] },
          ],
        },
      ],
    },
  ] as unknown as MenuCategory[];

const line: CartLine = {
  key: 'tacos|bla|ched',
  itemId: 'tacos',
  name: 'Menu Tacos',
  unitPriceCents: 1050 + 100,
  quantity: 2,
  options: [
    { id: 'bla', groupName: 'Sauce', name: 'Blanche', priceDeltaCents: 0 },
    { id: 'ched', groupName: 'Suppléments', name: 'Cheddar', priceDeltaCents: 100 },
  ],
  isLoyaltyMenu: true,
  basePriceCents: 1050,
};

describe('repriceLines', () => {
  it('ne change rien quand la carte est identique', () => {
    const result = repriceLines([line], menu(1050));
    expect(result.removed).toEqual([]);
    expect(result.changed).toEqual([]);
    expect(result.lines[0].unitPriceCents).toBe(1150);
  });

  it('met à jour le prix quand le restaurant a changé son tarif ou un supplément', () => {
    const result = repriceLines([line], menu(1100, 150));
    expect(result.changed).toEqual(['Menu Tacos']);
    expect(result.lines[0]).toMatchObject({
      unitPriceCents: 1250,
      basePriceCents: 1100,
      quantity: 2,
    });
  });

  it('retire un produit en rupture, hors créneau, supprimé ou dont une option a disparu', () => {
    expect(repriceLines([line], menu(1050, 100, false)).removed).toEqual(['Menu Tacos']);
    expect(repriceLines([line], menu(1050, 100, true, false)).removed).toEqual(['Menu Tacos']);
    expect(repriceLines([line], []).removed).toEqual(['Menu Tacos']);
    const noCheddar = menu(1050);
    noCheddar[0].menu_items[0].menu_option_groups[0].menu_options.pop();
    expect(repriceLines([line], noCheddar).removed).toEqual(['Menu Tacos']);
  });
});
