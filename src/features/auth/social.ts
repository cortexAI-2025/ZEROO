// Version web (app.zeroo.online) : Google et Apple passent par la redirection OAuth de Supabase.
// Au retour sur /auth-callback, supabase-js installe la session lui-même (detectSessionInUrl).
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

import { authCallbackUrl } from './api';

export type SocialResult = 'signed-in' | 'cancelled';

export async function isAppleSignInAvailable() {
  return env.oauthProviders.includes('apple');
}

export function isGoogleSignInAvailable() {
  return env.oauthProviders.includes('google');
}

async function redirectTo(provider: 'google' | 'apple'): Promise<SocialResult> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: authCallbackUrl() },
  });
  if (error) throw error;
  // Le navigateur quitte la page vers Google / Apple.
  return 'signed-in';
}

export function signInWithApple() {
  return redirectTo('apple');
}

export function signInWithGoogle() {
  return redirectTo('google');
}
