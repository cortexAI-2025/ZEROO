import type { User } from '@supabase/supabase-js';

/**
 * Production: verified email AND verified phone for professionals.
 * Hosted E2E staging: two known test identities may skip SMS.
 * This is only a UX check; the database enforces the server-side rule.
 */
const STAGING_PROJECT_URL = 'https://drebeoivuytxbvmppprz.supabase.co';
const STAGING_PRO_EMAILS = new Set(['commercant@zeroo.test', 'livreur@zeroo.test']);

export type ProVerification = {
  emailConfirmed: boolean;
  phoneVerified: boolean;
  /** Verified number, E.164 (+33…). */
  phone: string | null;
  verified: boolean;
};

export function proVerification(user: User | null | undefined): ProVerification {
  const emailConfirmed = Boolean(user?.email_confirmed_at);
  const phone = user?.phone ? `+${user.phone.replace(/^\\+/, '')}` : null;
  const phoneVerified = Boolean(user?.phone_confirmed_at) && phone !== null;
  const isStagingTestAccount =
    process.env.EXPO_PUBLIC_SUPABASE_URL === STAGING_PROJECT_URL &&
    STAGING_PRO_EMAILS.has(user?.email?.toLowerCase() ?? '');
  return {
    emailConfirmed,
    phoneVerified: phoneVerified || (emailConfirmed && isStagingTestAccount),
    phone: phoneVerified ? phone : null,
    verified: emailConfirmed && (phoneVerified || isStagingTestAccount),
  };
}
