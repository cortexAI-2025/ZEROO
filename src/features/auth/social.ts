// Version web : l'espace commerçant sur navigateur utilise la connexion par e-mail.
// Apple et Google (via signInWithOAuth) pourront être ajoutés ici si besoin.
export type SocialResult = 'signed-in' | 'cancelled';

export async function isAppleSignInAvailable() {
  return false;
}

export function isGoogleSignInAvailable() {
  return false;
}

export async function signInWithApple(): Promise<SocialResult> {
  throw new Error('Connexion Apple indisponible sur le web');
}

export async function signInWithGoogle(): Promise<SocialResult> {
  throw new Error('Connexion Google indisponible sur le web');
}
