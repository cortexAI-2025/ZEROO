import { isValidSiret, normalizeSiret } from '../siret';

describe('SIRET', () => {
  it('accepte un SIRET valide, avec ou sans espaces', () => {
    expect(isValidSiret('73282932000074')).toBe(true);
    expect(isValidSiret('732 829 320 00074')).toBe(true);
    expect(normalizeSiret('732 829 320 00074')).toBe('73282932000074');
  });

  it('refuse une clé fausse ou un format invalide', () => {
    expect(isValidSiret('73282932000075')).toBe(false);
    expect(isValidSiret('1234')).toBe(false);
    expect(isValidSiret('7328293200007A')).toBe(false);
  });

  it('applique la règle particulière de La Poste', () => {
    expect(isValidSiret('35600000000010')).toBe(true);
    expect(isValidSiret('35600000000011')).toBe(false);
  });
});
