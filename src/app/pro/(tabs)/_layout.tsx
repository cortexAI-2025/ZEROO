import Tabs from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';

import { tabIcon } from '@/components/TabIcon';
import { useThemeColors } from '@/theme';

export default function MerchantTabsLayout() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.brand }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('merchant.tabs.orders'), tabBarIcon: tabIcon('notifications-outline') }}
      />
      <Tabs.Screen
        name="menu"
        options={{ title: t('merchant.tabs.menu'), tabBarIcon: tabIcon('restaurant-outline') }}
      />
      <Tabs.Screen
        name="stats"
        options={{ title: t('merchant.tabs.stats'), tabBarIcon: tabIcon('bar-chart-outline') }}
      />
      <Tabs.Screen
        name="shop"
        options={{ title: t('merchant.tabs.shop'), tabBarIcon: tabIcon('storefront-outline') }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: t('merchant.tabs.account'), tabBarIcon: tabIcon('person-outline') }}
      />
    </Tabs>
  );
}
