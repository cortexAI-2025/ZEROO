import { formatFrenchDate, parseFrenchDate } from '../dates';

describe('parseFrenchDate', () => {
  it('accepte les séparateurs usuels et l’année sur 2 chiffres', () => {
    expect(parseFrenchDate('24/12/2026')).toBe('2026-12-24');
    expect(parseFrenchDate('4-1-2027')).toBe('2027-01-04');
    expect(parseFrenchDate(' 24.12.26 ')).toBe('2026-12-24');
  });

  it('refuse les dates qui n’existent pas', () => {
    expect(parseFrenchDate('31/04/2026')).toBeNull();
    expect(parseFrenchDate('29/02/2027')).toBeNull();
    expect(parseFrenchDate('00/10/2026')).toBeNull();
    expect(parseFrenchDate('12/13/2026')).toBeNull();
  });

  it('accepte le 29 février d’une année bissextile', () => {
    expect(parseFrenchDate('29/02/2028')).toBe('2028-02-29');
  });

  it('refuse un format inconnu', () => {
    expect(parseFrenchDate('demain')).toBeNull();
    expect(parseFrenchDate('2026-12-24')).toBeNull();
    expect(parseFrenchDate('')).toBeNull();
  });
});

describe('formatFrenchDate', () => {
  it('affiche jour/mois/année, avec ou sans heure', () => {
    expect(formatFrenchDate('2026-12-24')).toBe('24/12/2026');
    expect(formatFrenchDate('2026-12-24T00:00:00+01:00')).toBe('24/12/2026');
  });
});
