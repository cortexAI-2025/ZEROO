import { supabase } from '@/lib/supabase';

import { authCallbackUrl } from './api';

export async function resendConfirmationEmail(email: string) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: authCallbackUrl() },
  });
  if (error) throw error;
}
