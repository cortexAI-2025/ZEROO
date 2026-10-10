import { z } from 'zod';

// Seules les variables EXPO_PUBLIC_* sont embarquées dans l'app.
// Elles doivent être lues littéralement (process.env.X) pour être inlinées par Metro.
const schema = z.object({
  supabaseUrl: z.url(),
  supabaseAnonKey: z.string().min(1),
  stripePublishableKey: z.string().startsWith('pk_').optional(),
  functionsUrl: z.url().optional(),
  googleWebClientId: z.string().optional(),
  googleIosClientId: z.string().optional(),
});

const parsed = schema.safeParse({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || undefined,
  functionsUrl: process.env.EXPO_PUBLIC_FUNCTIONS_URL || undefined,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
});

if (!parsed.success) {
  throw new Error(
    `Variables d'environnement invalides, voir .env.example :\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = {
  ...parsed.data,
  // Par défaut, les Edge Functions sont servies par Supabase lui-même.
  functionsUrl: parsed.data.functionsUrl ?? `${parsed.data.supabaseUrl}/functions/v1`,
};
