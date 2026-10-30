import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

/** Erreur renvoyée par une Edge Function : `message` est le code métier (clé i18n). */
export class FunctionError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Délai maximal d'un appel : au-delà, l'utilisateur voit une erreur réseau plutôt qu'un bouton bloqué. */
const TIMEOUT_MS = 20_000;

/** Appelle une Edge Function avec la session de l'utilisateur. */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  let response: Response;
  try {
    response = await fetch(`${env.functionsUrl}/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${data.session?.access_token ?? env.supabaseAnonKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Hors ligne, serveur injoignable ou délai dépassé : message dédié (voir isNetworkError).
    throw new FunctionError('network_error', 0);
  }
  const json = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new FunctionError(json.error ?? 'internal_error', response.status);
  return json as T;
}
