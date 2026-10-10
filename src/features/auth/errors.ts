import { isAuthError } from '@supabase/supabase-js';

export type AuthErrorKey =
  | 'auth.errors.invalidCredentials'
  | 'auth.errors.emailNotConfirmed'
  | 'auth.errors.userAlreadyExists'
  | 'auth.errors.weakPassword'
  | 'auth.errors.rateLimited'
  | 'common.genericError';

const byCode: Record<string, AuthErrorKey> = {
  invalid_credentials: 'auth.errors.invalidCredentials',
  email_not_confirmed: 'auth.errors.emailNotConfirmed',
  user_already_exists: 'auth.errors.userAlreadyExists',
  email_exists: 'auth.errors.userAlreadyExists',
  weak_password: 'auth.errors.weakPassword',
  over_request_rate_limit: 'auth.errors.rateLimited',
  over_email_send_rate_limit: 'auth.errors.rateLimited',
};

/** Traduit une erreur Supabase Auth en clé i18n affichable. */
export function authErrorKey(error: unknown): AuthErrorKey {
  if (isAuthError(error) && error.code && byCode[error.code]) {
    return byCode[error.code];
  }
  return 'common.genericError';
}
