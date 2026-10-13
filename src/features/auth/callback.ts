export type AuthCallbackResult =
  | { kind: 'session'; accessToken: string; refreshToken: string; isRecovery: boolean }
  | { kind: 'error'; description: string }
  | { kind: 'none' };

/**
 * Lit les jetons renvoyés par Supabase dans le lien des e-mails
 * (confirmation d'inscription, réinitialisation du mot de passe) :
 * zeroo://auth-callback#access_token=…&refresh_token=…&type=recovery
 */
export function parseAuthCallback(url: string | null | undefined): AuthCallbackResult {
  if (!url) return { kind: 'none' };

  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const raw = [
    hashIndex >= 0 ? url.slice(hashIndex + 1) : '',
    queryIndex >= 0
      ? url.slice(queryIndex + 1, hashIndex > queryIndex ? hashIndex : undefined)
      : '',
  ].join('&');
  const params = new URLSearchParams(raw);

  const error = params.get('error_description') ?? params.get('error');
  if (error) return { kind: 'error', description: error };

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return { kind: 'none' };

  return {
    kind: 'session',
    accessToken,
    refreshToken,
    isRecovery: params.get('type') === 'recovery',
  };
}
