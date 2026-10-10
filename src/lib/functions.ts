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

/** Appelle une Edge Function avec la session de l'utilisateur. */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`${env.functionsUrl}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${data.session?.access_token ?? env.supabaseAnonKey}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new FunctionError(json.error ?? 'internal_error', response.status);
  return json as T;
}
