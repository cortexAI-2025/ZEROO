import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { QueryState } from '@/components/ui';
import { useMyMerchant } from '@/features/merchant/hooks';

/** Espace commerçant : tant qu'aucun commerce n'existe, seul l'écran de création est accessible. */
export default function MerchantLayout() {
  const { t } = useTranslation();
  const { data: merchant, isPending, error, refetch } = useMyMerchant();

  if (isPending || error) return <QueryState error={error} onRetry={() => void refetch()} />;

  const hasMerchant = !!merchant;
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Protected guard={hasMerchant}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="item/[id]" options={{ title: t('merchant.menu.item.editTitle') }} />
        <Stack.Screen name="category/[id]" options={{ title: t('merchant.menu.editCategory') }} />
        <Stack.Screen name="info" options={{ title: t('merchant.shop.info') }} />
        <Stack.Screen name="hours" options={{ title: t('merchant.hours.title') }} />
        <Stack.Screen name="closures" options={{ title: t('merchant.closures.title') }} />
        <Stack.Screen name="qr" options={{ title: t('merchant.qr.title') }} />
        <Stack.Screen name="history" options={{ title: t('merchant.orders.history') }} />
        <Stack.Screen name="stripe" options={{ title: t('merchant.billing.returnTitle') }} />
        <Stack.Screen name="delivery" options={{ title: t('merchant.delivery.title') }} />
      </Stack.Protected>
      <Stack.Protected guard={!hasMerchant}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
