import { parseAuthCallback } from '../callback';

describe('parseAuthCallback', () => {
  it('lit les jetons du fragment (confirmation d’inscription)', () => {
    expect(
      parseAuthCallback('zeroo://auth-callback#access_token=a&refresh_token=r&type=signup'),
    ).toEqual({ kind: 'session', accessToken: 'a', refreshToken: 'r', isRecovery: false });
  });

  it('détecte un lien de réinitialisation du mot de passe', () => {
    expect(
      parseAuthCallback('zeroo://auth-callback#access_token=a&refresh_token=r&type=recovery'),
    ).toMatchObject({ kind: 'session', isRecovery: true });
  });

  it('remonte l’erreur d’un lien expiré', () => {
    expect(
      parseAuthCallback(
        'zeroo://auth-callback#error=access_denied&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toEqual({ kind: 'error', description: 'Email link is invalid or has expired' });
  });

  it('lit aussi les paramètres de requête', () => {
    expect(parseAuthCallback('exp://192.168.1.2:8081/--/auth-callback?error=server_error')).toEqual(
      {
        kind: 'error',
        description: 'server_error',
      },
    );
  });

  it('ignore une URL sans jetons', () => {
    expect(parseAuthCallback('zeroo://auth-callback')).toEqual({ kind: 'none' });
    expect(parseAuthCallback(null)).toEqual({ kind: 'none' });
  });
});
