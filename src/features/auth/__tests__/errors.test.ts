import { AuthApiError } from '@supabase/supabase-js';

import { authErrorKey } from '../errors';

describe('authErrorKey', () => {
  it('traduit les codes Supabase connus', () => {
    expect(
      authErrorKey(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')),
    ).toBe('auth.errors.invalidCredentials');
    expect(authErrorKey(new AuthApiError('Email not confirmed', 400, 'email_not_confirmed'))).toBe(
      'auth.errors.emailNotConfirmed',
    );
  });

  it('retombe sur un message générique', () => {
    expect(authErrorKey(new Error('réseau'))).toBe('common.genericError');
    expect(authErrorKey(new AuthApiError('?', 500, 'unexpected_failure'))).toBe(
      'common.genericError',
    );
  });
});
