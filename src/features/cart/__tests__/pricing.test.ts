import type { MenuItem } from '@/features/menu/types';

import { chosenOptions, selectionIssues, toggleOption, unitPriceCents } from '../pricing';

const option = (
  id: string,
  group_id: string,
  name: string,
  price_delta_cents = 0,
  position = 0,
) => ({
  id,
  group_id,
  name,
  price_delta_cents,
  position,
  is_available: true,
  merchant_id: 'm',
});

const tacos = {
  id: 'tacos',
  name: 'Menu Tacos',
  price_cents: 1050,
  menu_option_groups: [
    {
      id: 'sauce',
      name: 'Sauce',
      min_select: 1,
      max_select: 2,
      position: 0,
      menu_options: [
        option('alg', 'sauce', 'Algérienne'),
        option('sam', 'sauce', 'Samouraï', 0, 1),
        option('bla', 'sauce', 'Blanche', 0, 2),
      ],
    },
    {
      id: 'sup',
      name: 'Suppléments',
      min_select: 0,
      max_select: 3,
      position: 1,
      menu_options: [option('ched', 'sup', 'Cheddar', 100)],
    },
  ],
} as unknown as MenuItem;

describe('sélection des options', () => {
  it('signale un groupe obligatoire non rempli', () => {
    expect(selectionIssues(tacos, {})).toEqual([{ groupId: 'sauce', kind: 'min' }]);
    expect(selectionIssues(tacos, { sauce: ['alg'] })).toEqual([]);
  });

  it('ne dépasse jamais le maximum d’un groupe', () => {
    let s = toggleOption(tacos, {}, 'sauce', 'alg');
    s = toggleOption(tacos, s, 'sauce', 'sam');
    s = toggleOption(tacos, s, 'sauce', 'bla');
    expect(s.sauce).toEqual(['alg', 'sam']);
  });

  it('décoche une option déjà cochée', () => {
    expect(toggleOption(tacos, { sauce: ['alg'] }, 'sauce', 'alg').sauce).toEqual([]);
  });

  it('calcule le prix unitaire avec les suppléments', () => {
    const s = { sauce: ['alg'], sup: ['ched'] };
    expect(unitPriceCents(tacos, s)).toBe(1150);
    expect(chosenOptions(tacos, s).map((o) => o.name)).toEqual(['Algérienne', 'Cheddar']);
  });
});
