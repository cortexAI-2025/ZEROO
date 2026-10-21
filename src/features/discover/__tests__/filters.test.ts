import type { MerchantSummary } from '../api';
import { activeFilterCount, applyFilters, mappable, NO_FILTERS } from '../filters';

const merchant = (over: Partial<MerchantSummary>): MerchantSummary => ({
  id: 'm',
  slug: 'm',
  name: 'M',
  category: 'snack',
  address_line: '1 rue A',
  city: 'Paris',
  distance_m: 500,
  is_open: true,
  is_accepting_orders: true,
  offers_pickup: true,
  offers_delivery: false,
  delivery_available_now: false,
  has_happy_hour_now: false,
  meal_periods: [],
  latitude: 48.86,
  longitude: 2.34,
  ...over,
});

const samir = merchant({
  id: 'samir',
  offers_delivery: true,
  delivery_available_now: true,
  has_happy_hour_now: true,
});
const boulangerie = merchant({
  id: 'mie',
  category: 'boulangerie',
  meal_periods: ['breakfast', 'lunch'],
});
const dark = merchant({
  id: 'dark',
  category: 'dark_kitchen',
  address_line: null,
  offers_pickup: false,
  offers_delivery: true,
  delivery_available_now: true,
  meal_periods: ['night'],
  latitude: null,
  longitude: null,
});
const closed = merchant({ id: 'closed', is_accepting_orders: false, is_open: false });
const livePaused = merchant({ id: 'paused', offers_delivery: true, delivery_available_now: false });
const all = [samir, boulangerie, dark, closed, livePaused];
const ids = (list: MerchantSummary[]) => list.map((m) => m.id);

describe('applyFilters', () => {
  it('sans filtre, garde tout', () => {
    expect(ids(applyFilters(all, NO_FILTERS))).toEqual(ids(all));
  });

  it('filtre par catégorie, y compris la dark kitchen', () => {
    expect(ids(applyFilters(all, { ...NO_FILTERS, category: 'boulangerie' }))).toEqual(['mie']);
    expect(ids(applyFilters(all, { ...NO_FILTERS, category: 'dark_kitchen' }))).toEqual(['dark']);
  });

  it('« ouvert maintenant » écarte les établissements qui n’acceptent pas de commande', () => {
    expect(ids(applyFilters(all, { ...NO_FILTERS, openNow: true }))).not.toContain('closed');
  });

  it('« retrait » écarte la dark kitchen', () => {
    expect(ids(applyFilters(all, { ...NO_FILTERS, pickup: true }))).not.toContain('dark');
  });

  it('« livraison » ne garde que la livraison réellement disponible maintenant', () => {
    expect(ids(applyFilters(all, { ...NO_FILTERS, delivery: true }))).toEqual(['samir', 'dark']);
  });

  it('« Happy Hour » et moment de repas', () => {
    expect(ids(applyFilters(all, { ...NO_FILTERS, happyHour: true }))).toEqual(['samir']);
    expect(ids(applyFilters(all, { ...NO_FILTERS, mealPeriod: 'breakfast' }))).toEqual(['mie']);
    expect(ids(applyFilters(all, { ...NO_FILTERS, mealPeriod: 'night' }))).toEqual(['dark']);
  });

  it('combine les filtres', () => {
    const filters = { ...NO_FILTERS, openNow: true, delivery: true, pickup: true };
    expect(ids(applyFilters(all, filters))).toEqual(['samir']);
  });
});

describe('mappable', () => {
  it('n’expose pas sur la carte les établissements sans position publique', () => {
    expect(ids(mappable(all))).toEqual(['samir', 'mie', 'closed', 'paused']);
  });
});

describe('activeFilterCount', () => {
  it('compte les filtres actifs', () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...NO_FILTERS, openNow: true, category: 'snack' })).toBe(2);
  });
});
