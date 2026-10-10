import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.117.3';

import { HttpError, requireEnv } from './http.ts';

/** Client service role : contourne la RLS, réservé au code serveur. */
export function adminClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Utilisateur authentifié par le jeton de la requête (401 sinon). */
export async function requireUser(req: Request): Promise<User> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'not_authenticated');
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'not_authenticated');
  return data.user;
}

/** Lève l'erreur Supabase éventuelle et renvoie les données. */
export function unwrap<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

/** Commerce dont l'utilisateur est propriétaire (404 sinon). */
export async function requireOwnedMerchant(db: SupabaseClient, userId: string) {
  const merchant = unwrap(
    await db.from('merchants').select('id, name, slug').eq('owner_id', userId).maybeSingle(),
  );
  if (!merchant) throw new HttpError(404, 'merchant_not_found');
  return merchant as { id: string; name: string; slug: string };
}

/** Profil livreur de l'utilisateur (404 sinon). */
export async function requireCourier(db: SupabaseClient, userId: string) {
  const courier = unwrap(
    await db.from('couriers').select('id, display_name').eq('user_id', userId).maybeSingle(),
  );
  if (!courier) throw new HttpError(404, 'courier_profile_required');
  return courier as { id: string; display_name: string };
}

/**
 * Professionnel abonné et payé via Stripe Connect : un restaurant ou un livreur. Mêmes
 * règles pour les deux (abonnement 30 € TTC, compte Stripe à son nom), tables distinctes.
 */
export type Professional = {
  role: 'merchant' | 'courier';
  id: string;
  name: string;
  /** Colonne de clé dans les tables d'abonnement et de compte Stripe. */
  key: 'merchant_id' | 'courier_id';
  subscriptionTable: 'subscriptions' | 'courier_subscriptions';
  accountTable: 'merchant_stripe_accounts' | 'courier_stripe_accounts';
  /** Écran de l'app où revenir après Stripe. */
  appPath: string;
  slug?: string;
};

export async function requireProfessional(
  db: SupabaseClient,
  userId: string,
  role: 'merchant' | 'courier' | undefined,
): Promise<Professional> {
  if (role === 'courier') {
    const courier = await requireCourier(db, userId);
    return {
      role: 'courier',
      id: courier.id,
      name: courier.display_name,
      key: 'courier_id',
      subscriptionTable: 'courier_subscriptions',
      accountTable: 'courier_stripe_accounts',
      appPath: '/livreur/compte',
    };
  }
  const merchant = await requireOwnedMerchant(db, userId);
  return {
    role: 'merchant',
    id: merchant.id,
    name: merchant.name,
    key: 'merchant_id',
    subscriptionTable: 'subscriptions',
    accountTable: 'merchant_stripe_accounts',
    appPath: '/pro/stripe',
    slug: merchant.slug,
  };
}
