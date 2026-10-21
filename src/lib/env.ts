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
  // Fond de carte de l'annuaire (web) : tuiles {z}/{x}/{y}. Défaut : OpenStreetMap (usage modéré).
  mapTilesUrl: z.string().default('https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
  // Fournisseurs de connexion activés dans Supabase (Authentication > Providers), pour le web.
  oauthProviders: z
    .string()
    .default('google,apple')
    .transform((value) =>
      value
        .split(',')
        .map((provider) => provider.trim())
        .filter(
          (provider): provider is 'google' | 'apple' =>
            provider === 'google' || provider === 'apple',
        ),
    ),
});

const parsed = schema.safeParse({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || undefined,
  functionsUrl: process.env.EXPO_PUBLIC_FUNCTIONS_URL || undefined,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
  mapTilesUrl: process.env.EXPO_PUBLIC_MAP_TILES_URL || undefined,
  oauthProviders: process.env.EXPO_PUBLIC_OAUTH_PROVIDERS || undefined,
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
