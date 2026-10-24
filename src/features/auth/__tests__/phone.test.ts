import type { User } from '@supabase/supabase-js';

import { formatPhone, toE164, toNationalFr } from '../phone';
import { proVerification } from '../status';

describe('toE164', () => {
  it('convertit les numéros français', () => {
    expect(toE164('06 12 34 56 78')).toBe('+33612345678');
    expect(toE164('07.98.76.54.32')).toBe('+33798765432');
    expect(toE164('+33 6 12 34 56 78')).toBe('+33612345678');
    expect(toE164('0033612345678')).toBe('+33612345678');
    expect(toE164('+33 (0)6 12 34 56 78')).toBe('+33612345678');
  });

  it('accepte les numéros internationaux', () => {
    expect(toE164('+212 6 61 23 45 67')).toBe('+212661234567');
    expect(toE164('+32 470 12 34 56')).toBe('+32470123456');
  });

  it('refuse les saisies invalides', () => {
    expect(toE164('')).toBeNull();
    expect(toE164('0612')).toBeNull();
    expect(toE164('6 12 34 56 78')).toBeNull();
    expect(toE164('+33 6 12 34')).toBeNull();
    expect(toE164('06 12 34 56 78 90')).toBeNull();
    expect(toE164('abc')).toBeNull();
  });
});

describe('formatPhone / toNationalFr', () => {
  it('affiche et pré-remplit un numéro vérifié', () => {
    expect(formatPhone('33612345678')).toBe('+33 6 12 34 56 78');
    expect(formatPhone('+212661234567')).toBe('+212661234567');
    expect(formatPhone(null)).toBe('');
    expect(toNationalFr('+33612345678')).toBe('0612345678');
    expect(toNationalFr('212661234567')).toBe('+212661234567');
  });
});

describe('proVerification', () => {
  const user = (fields: Partial<User>) => ({ id: 'u', ...fields }) as User;

  it('exige uniquement un e-mail confirmé', () => {
    expect(proVerification(null).verified).toBe(false);
    expect(proVerification(user({ email_confirmed_at: 'x' }))).toEqual({
      emailConfirmed: true,
      phoneVerified: false,
      phone: null,
      verified: true,
    });
    expect(
      proVerification(
        user({ email_confirmed_at: 'x', phone: '33612345678', phone_confirmed_at: 'y' }),
      ),
    ).toEqual({ emailConfirmed: true, phoneVerified: true, phone: '+33612345678', verified: true });
  });

  it('ignore un numéro saisi mais pas encore vérifié', () => {
    expect(
      proVerification(user({ email_confirmed_at: 'x', phone: '33612345678' })).phoneVerified,
    ).toBe(false);
  });
});
