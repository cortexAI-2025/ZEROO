import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type PushStatus = 'unsupported' | 'undetermined' | 'granted' | 'denied';

// Notification reçue app ouverte : on l'affiche quand même (bannière + son).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const projectId = (): string | undefined =>
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;

/** Jeton de cet appareil, mémorisé pour le retirer à la déconnexion. */
let currentToken: string | null = null;

export async function getPushStatus(): Promise<PushStatus> {
  if (!Device.isDevice || !projectId()) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

/**
 * Enregistre l'appareil pour les notifications. `ask` : affiche la demande système
 * (uniquement après une action de l'utilisateur, jamais au lancement de l'app).
 */
export async function registerForPush({ ask }: { ask: boolean }): Promise<PushStatus> {
  const id = projectId();
  if (!Device.isDevice || !id) return 'unsupported';

  if (Platform.OS === 'android') {
    // Canal des commandes : importance maximale, sonnerie « nouvelle commande ».
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Commandes',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'new-order.wav',
      vibrationPattern: [0, 400, 200, 400],
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask) ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return status === 'denied' ? 'denied' : 'undetermined';

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  if (error) throw error;
  currentToken = token;
  return 'granted';
}

/** À la déconnexion : cet appareil ne doit plus recevoir les notifications du compte. */
export async function unregisterPush() {
  if (!currentToken) return;
  await supabase.from('push_tokens').delete().eq('expo_token', currentToken);
  currentToken = null;
}

/** Ouvre l'écran indiqué dans la notification touchée (app ouverte ou lancée par la notification). */
export function addNotificationTapListener(open: (url: string) => void) {
  const pending = Notifications.getLastNotificationResponse();
  const initialUrl = pending?.notification.request.content.data?.url;
  if (typeof initialUrl === 'string') {
    open(initialUrl);
    void Notifications.clearLastNotificationResponseAsync();
  }
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = response.notification.request.content.data?.url;
    if (typeof url === 'string') open(url);
  });
  return () => subscription.remove();
}
