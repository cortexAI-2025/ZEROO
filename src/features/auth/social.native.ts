import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

/** Résultat d'une connexion sociale : `cancelled` quand l'utilisateur ferme la fenêtre. */
export type SocialResult = 'signed-in' | 'cancelled';

export async function isAppleSignInAvailable() {
  return Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync());
}

export function isGoogleSignInAvailable() {
  return Boolean(env.googleWebClientId);
}

export async function signInWithApple(): Promise<SocialResult> {
  // Apple reçoit le nonce haché, Supabase le nonce brut pour vérifier le jeton.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    throw error;
  }
  if (!credential.identityToken) throw new Error('Apple n’a pas renvoyé de jeton');

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;

  // Apple ne transmet le nom qu'à la toute première connexion : on le garde.
  const fullName = credential.fullName
    ? AppleAuthentication.formatFullName(credential.fullName).trim()
    : '';
  if (fullName) {
    await supabase.auth.updateUser({ data: { full_name: fullName } });
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase
        .from('profiles')
        .update({ display_name: fullName.slice(0, 80) })
        .eq('id', data.user.id)
        .is('display_name', null);
    }
  }
  return 'signed-in';
}

export async function signInWithGoogle(): Promise<SocialResult> {
  // Import différé : le module natif n'existe pas dans Expo Go.
  const { GoogleSignin, isSuccessResponse } =
    await import('@react-native-google-signin/google-signin');

  GoogleSignin.configure({
    webClientId: env.googleWebClientId,
    iosClientId: env.googleIosClientId,
  });
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return 'cancelled';

  const idToken = response.data.idToken;
  if (!idToken) throw new Error('Google n’a pas renvoyé de jeton');

  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
  return 'signed-in';
}
