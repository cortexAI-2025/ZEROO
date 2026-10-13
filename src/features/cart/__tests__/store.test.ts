import { cartCount, cartDiscountCents, cartTotalCents, useCart } from '../store';

const samir = { id: 'm1', slug: 'chez-samir', name: 'Chez Samir' };
const lea = { id: 'm2', slug: 'chez-lea', name: 'Chez Léa' };
const kebab = {
  itemId: 'k',
  name: 'Kebab',
  unitPriceCents: 750,
  quantity: 1,
  options: [],
  isLoyaltyMenu: false,
  basePriceCents: 750,
};
const cheddar = { id: 'c', groupName: 'Suppléments', name: 'Cheddar', priceDeltaCents: 100 };
const tacos = {
  itemId: 't',
  name: 'Menu Tacos',
  unitPriceCents: 1150,
  quantity: 1,
  options: [cheddar],
  isLoyaltyMenu: true,
  basePriceCents: 1050,
};

beforeEach(() => useCart.getState().clear());

describe('panier', () => {
  it('fusionne deux ajouts identiques et calcule le total', () => {
    useCart.getState().add(samir, kebab);
    useCart.getState().add(samir, { ...kebab, quantity: 2 });
    const { lines } = useCart.getState();
    expect(lines).toHaveLength(1);
    expect(cartCount(lines)).toBe(3);
    expect(cartTotalCents(lines)).toBe(2250);
  });

  it('distingue les lignes selon les options', () => {
    const blanche = { id: 'o1', groupName: 'Sauce', name: 'Blanche', priceDeltaCents: 0 };
    useCart.getState().add(samir, kebab);
    useCart.getState().add(samir, { ...kebab, options: [blanche] });
    expect(useCart.getState().lines).toHaveLength(2);
  });

  it('refuse un second commerce sans confirmation, puis le remplace', () => {
    useCart.getState().add(samir, kebab);
    expect(useCart.getState().add(lea, kebab)).toBe(false);
    expect(useCart.getState().merchant?.id).toBe('m1');
    expect(useCart.getState().add(lea, kebab, { replace: true })).toBe(true);
    expect(useCart.getState().merchant?.id).toBe('m2');
    expect(useCart.getState().lines).toHaveLength(1);
  });

  it('retire une ligne quand la quantité tombe à zéro', () => {
    useCart.getState().add(samir, kebab);
    const key = useCart.getState().lines[0].key;
    useCart.getState().setQuantity(key, 0);
    expect(useCart.getState().lines).toHaveLength(0);
  });

  it('menu offert : déduit le prix du menu, garde les suppléments', () => {
    useCart.getState().add(samir, tacos);
    useCart.getState().add(samir, kebab);
    const { lines } = useCart.getState();
    const tacosKey = lines.find((l) => l.itemId === 't')!.key;
    expect(cartDiscountCents(lines, tacosKey)).toBe(1050);
    // Un produit au détail ne peut pas être offert.
    expect(cartDiscountCents(lines, lines.find((l) => l.itemId === 'k')!.key)).toBe(0);
  });

  it('menu offert : un reste inférieur à 0,50 € est offert aussi', () => {
    useCart.getState().add(samir, { ...tacos, options: [], unitPriceCents: 1050 });
    const { lines } = useCart.getState();
    expect(cartDiscountCents(lines, lines[0].key)).toBe(1050);
  });

  it('retirer la ligne du menu offert annule le choix', () => {
    useCart.getState().add(samir, tacos);
    const key = useCart.getState().lines[0].key;
    useCart.getState().setRewardLine(key);
    useCart.getState().setQuantity(key, 0);
    expect(useCart.getState().rewardLineKey).toBeNull();
  });
});
