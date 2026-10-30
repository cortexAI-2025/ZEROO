import { isValidPublicPhone } from '../publicPhone';

describe('isValidPublicPhone', () => {
  it('accepte vide, national et international', () => {
    for (const v of ['', '  ', '01 44 55 66 77', '0144556677', '+33 1 44 55 66 77']) {
      expect(isValidPublicPhone(v)).toBe(true);
    }
  });
  it('refuse le texte et les numéros trop courts ou trop longs', () => {
    for (const v of ['appelez-moi', '1234', '012345678901234567890123']) {
      expect(isValidPublicPhone(v)).toBe(false);
    }
  });
});
