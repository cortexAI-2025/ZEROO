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

  it('traduit les erreurs de vérification par SMS', () => {
    expect(
      authErrorKey(new AuthApiError('Token has expired or is invalid', 403, 'otp_expired')),
    ).toBe('auth.errors.otpInvalid');
    expect(authErrorKey(new AuthApiError('Phone exists', 422, 'phone_exists'))).toBe(
      'auth.errors.phoneTaken',
    );
    expect(
      authErrorKey(new AuthApiError('Unsupported phone provider', 400, 'phone_provider_disabled')),
    ).toBe('auth.errors.smsUnavailable');
  });

  it('retombe sur un message générique', () => {
    expect(authErrorKey(new Error('réseau'))).toBe('common.genericError');
    expect(authErrorKey(new AuthApiError('?', 500, 'unexpected_failure'))).toBe(
      'common.genericError',
    );
  });
});
