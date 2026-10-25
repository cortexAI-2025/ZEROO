// Doit rester le premier import : installe localStorage sur iOS/Android.
import 'expo-sqlite/localStorage/install';
import '@/i18n';

import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QueryState } from '@/components/ui';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { addNotificationTapListener } from '@/features/notifications/push';
import { SpaceProvider, useSpace } from '@/features/space/SpaceProvider';
import { queryClient } from '@/lib/query-client';

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, isLoading } = useAuth();
  const { space, isLoading: spaceLoading, error: spaceError, refetch } = useSpace();

  useEffect(() => {
    if (!isLoading) void SplashScreen.hideAsync();
  }, [isLoading]);

  // Toucher une notification ouvre l'écran concerné (commande, tableau de bord).
  useEffect(() => {
    if (isLoading || spaceLoading || spaceError) return;
    return addNotificationTapListener((url) => router.push(url as never));
  }, [isLoading, spaceLoading, spaceError]);

  if (isLoading || spaceLoading || spaceError)
    return <QueryState error={spaceError} onRetry={refetch} />;

  const signedIn = !!session;
  // Le navigateur n'accorde aucune route privée avant la lecture du rôle serveur.
  const allow = (condition: boolean) => condition;

  // L'ordre compte : quand un écran devient inaccessible, Expo Router
  // redirige vers le premier écran autorisé de cette liste.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Racine : page d'accueil de l'app web pour les visiteurs (web), sinon aiguillage
          vers l'espace de l'utilisateur. Toujours accessible : c'est aussi l'écran vers
          lequel Expo Router se replie quand une garde se ferme. */}
      <Stack.Screen name="index" />
      <Stack.Screen name="mentions-legales" options={{ headerShown: true, title: '' }} />
      <Stack.Screen name="confidentialite" options={{ headerShown: true, title: '' }} />
      <Stack.Protected guard={allow(signedIn && space === 'client')}>
        <Stack.Screen name="(client)" />
        <Stack.Screen name="addresses" options={{ headerShown: true }} />
        <Stack.Screen name="favorites" options={{ headerShown: true }} />
        <Stack.Screen name="order/[id]" options={{ headerShown: true }} />
      </Stack.Protected>
      <Stack.Protected guard={allow(signedIn && space === 'merchant')}>
        <Stack.Screen name="pro" />
      </Stack.Protected>
      <Stack.Protected guard={allow(signedIn && space === 'courier')}>
        <Stack.Screen name="livreur" />
      </Stack.Protected>
      <Stack.Protected guard={allow(signedIn && !space)}>
        <Stack.Screen name="choose-space" />
      </Stack.Protected>
      <Stack.Protected guard={allow(signedIn)}>
        <Stack.Screen name="update-password" options={{ headerShown: true, title: '' }} />

        <Stack.Screen name="admin" options={{ headerShown: true }} />
      </Stack.Protected>
      <Stack.Protected guard={allow(!signedIn)}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Screen name="auth-callback" />
      {/* Accessibles sans compte : un client qui scanne le QR code d'un commerce voit son menu
          et prépare son panier ; la connexion n'est demandée qu'au moment de commander. */}
      <Stack.Screen name="m/[slug]" options={{ headerShown: true, title: '' }} />
      <Stack.Protected guard={!signedIn || space === 'client'}>
        <Stack.Screen name="cart" options={{ headerShown: true }} />
      </Stack.Protected>
      {/* Annuaire public : on découvre les établissements sans compte. */}
      <Stack.Screen name="decouvrir" options={{ headerShown: true, title: '' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SpaceProvider>
              <RootNavigator />
            </SpaceProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
