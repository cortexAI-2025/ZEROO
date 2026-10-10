import { centsToInput, formatCents, parsePriceToCents } from '../money';

describe('formatCents', () => {
  it('formate en euros à la française', () => {
    expect(formatCents(850)).toBe('8,50 €');
    expect(formatCents(123456)).toBe('1 234,56 €');
    expect(formatCents(0)).toBe('0,00 €');
  });
});

describe('parsePriceToCents', () => {
  it.each([
    ['8,50', 850],
    ['8.5', 850],
    ['8', 800],
    [' 12,90 € ', 1290],
    ['0,99', 99],
  ])('« %s » → %i', (input, expected) => {
    expect(parsePriceToCents(input)).toBe(expected);
  });

  it.each(['', 'abc', '8,555', '-3', '12345'])('refuse « %s »', (input) => {
    expect(parsePriceToCents(input)).toBeNull();
  });
});

describe('centsToInput', () => {
  it('prépare la valeur d’un champ', () => {
    expect(centsToInput(850)).toBe('8,50');
  });
});
