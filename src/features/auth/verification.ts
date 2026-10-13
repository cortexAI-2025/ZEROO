import { supabase } from '@/lib/supabase';

import { authCallbackUrl } from './api';

/** Envoie un code SMS au numéro (E.164) : il sera rattaché au compte une fois le code validé. */
export async function sendPhoneCode(phone: string) {
  const { error } = await supabase.auth.updateUser({ phone });
  if (error) throw error;
}

export async function verifyPhoneCode(phone: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'phone_change' });
  if (error) throw error;
  // Recharge l'utilisateur : la session porte alors phone_confirmed_at.
  await supabase.auth.refreshSession();
}

export async function resendConfirmationEmail(email: string) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: authCallbackUrl() },
  });
  if (error) throw error;
}
