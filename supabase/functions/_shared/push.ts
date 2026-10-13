import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';

import { unwrap } from './supabase.ts';

export type PushContent = {
  title: string;
  body: string;
  /** url : écran à ouvrir quand on touche la notification. */
  data?: { url: string };
  /** Sonnerie personnalisée (fichier embarqué dans l'app) ou 'default'. */
  sound?: string;
  /** Canal Android (importance, son). */
  channelId?: string;
};

type Ticket = { status: 'ok' | 'error'; details?: { error?: string } };

const pushUrl = () => Deno.env.get('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send';

/**
 * Envoie une notification à tous les appareils des utilisateurs donnés via Expo Push.
 * Les appareils désinstallés (DeviceNotRegistered) sont supprimés. Ne lève pas d'erreur :
 * une notification manquée ne doit jamais faire échouer une commande.
 */
export async function sendPush(db: SupabaseClient, userIds: string[], content: PushContent) {
  if (userIds.length === 0) return { sent: 0 };
  const rows = unwrap(await db.from('push_tokens').select('expo_token').in('user_id', userIds)) as {
    expo_token: string;
  }[];
  const tokens = rows.map((r) => r.expo_token);
  let sent = 0;

  // L'API Expo accepte 100 messages par requête.
  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100);
    try {
      const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
      const response = await fetch(pushUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(
          batch.map((to) => ({ to, priority: 'high', sound: 'default', ...content })),
        ),
      });
      const { data } = (await response.json()) as { data?: Ticket[] };
      const stale = batch.filter(
        (_, index) => data?.[index]?.details?.error === 'DeviceNotRegistered',
      );
      if (stale.length) await db.from('push_tokens').delete().in('expo_token', stale);
      sent += (data ?? []).filter((t) => t.status === 'ok').length;
    } catch (error) {
      console.warn('Envoi des notifications impossible', (error as Error).message);
    }
  }
  return { sent };
}
