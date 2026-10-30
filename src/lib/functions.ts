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
  let json: { error?: string };
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
    // Le délai court aussi pendant la lecture du corps : une coupure à ce stade est une erreur réseau,
    // pas une réponse vide ; seul un corps illisible (HTML d'un proxy, par exemple) devient `{}`.
    json = (await response.json().catch((e: unknown) => {
      if (e instanceof Error && ['AbortError', 'TimeoutError', 'TypeError'].includes(e.name))
        throw e;
      return {};
    })) as { error?: string };
  } catch {
    // Hors ligne, serveur injoignable ou délai dépassé : message dédié (voir isNetworkError).
    throw new FunctionError('network_error', 0);
  }
  if (!response.ok) throw new FunctionError(json.error ?? 'internal_error', response.status);
  return json as T;
}
