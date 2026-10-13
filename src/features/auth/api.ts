import * as Linking from 'expo-linking';

import { unregisterPush } from '@/features/notifications/push';
import { supabase } from '@/lib/supabase';

import type { NewPasswordValues, ResetRequestValues, SignInValues, SignUpValues } from './schemas';

/** URL vers laquelle renvoient les liens des e-mails d'authentification. */
export const authCallbackUrl = () => Linking.createURL('auth-callback');

export async function signInWithEmail({ email, password }: SignInValues) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Retourne `true` si l'utilisateur doit encore confirmer son e-mail. */
export async function signUpWithEmail({ email, password, displayName }: SignUpValues) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: authCallbackUrl(),
      data: displayName ? { full_name: displayName } : undefined,
    },
  });
  if (error) throw error;
  return data.session === null;
}

export async function requestPasswordReset({ email }: ResetRequestValues) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: authCallbackUrl(),
  });
  if (error) throw error;
}

export async function updatePassword({ password }: NewPasswordValues) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  // Avant la déconnexion : cet appareil ne doit plus recevoir les notifications du compte.
  await unregisterPush().catch(() => undefined);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Suppression définitive du compte (RGPD), voir delete_my_account() en base. */
export async function deleteAccount() {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  // La session locale n'est plus valide : on la purge sans appel réseau.
  await supabase.auth.signOut({ scope: 'local' });
}
