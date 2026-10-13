import { Stack } from 'expo-router';

import { QueryState } from '@/components/ui';
import { useMyCourier } from '@/features/courier/hooks';

/** Espace livreur : tant que le profil n'existe pas, seul l'écran d'inscription est accessible. */
export default function CourierLayout() {
  const { data: courier, isPending, error, refetch } = useMyCourier();

  if (isPending || error) return <QueryState error={error} onRetry={() => void refetch()} />;

  const hasCourier = !!courier;
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Protected guard={hasCourier}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profil" />
      </Stack.Protected>
      <Stack.Protected guard={!hasCourier}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
