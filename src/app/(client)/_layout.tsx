import Tabs from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';

import { tabIcon } from '@/components/TabIcon';
import { useThemeColors } from '@/theme';

export default function ClientLayout() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.brand }}>
      <Tabs.Screen
        name="explore"
        options={{ title: t('client.tabs.explore'), tabBarIcon: tabIcon('storefront-outline') }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: t('client.tabs.orders'), tabBarIcon: tabIcon('receipt-outline') }}
      />
      <Tabs.Screen
        name="loyalty"
        options={{ title: t('client.tabs.loyalty'), tabBarIcon: tabIcon('gift-outline') }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: t('client.tabs.account'), tabBarIcon: tabIcon('person-outline') }}
      />
    </Tabs>
  );
}
