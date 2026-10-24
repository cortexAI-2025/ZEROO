import type { User } from '@supabase/supabase-js';

/** Professional account verification requires a confirmed email only. */
export type ProVerification = {
  emailConfirmed: boolean;
  phoneVerified: boolean;
  /** Numéro vérifié, en E.164 (+33…). */
  phone: string | null;
  verified: boolean;
};

export function proVerification(user: User | null | undefined): ProVerification {
  const emailConfirmed = Boolean(user?.email_confirmed_at);
  const phone = user?.phone ? `+${user.phone.replace(/^\+/, '')}` : null;
  const phoneVerified = Boolean(user?.phone_confirmed_at) && phone !== null;
  return {
    emailConfirmed,
    phoneVerified,
    phone: phoneVerified ? phone : null,
    verified: emailConfirmed,
  };
}
