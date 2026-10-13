import Tabs from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';

import { tabIcon } from '@/components/TabIcon';
import { useThemeColors } from '@/theme';

export default function CourierTabsLayout() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.brand }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('courier.tabs.runs'), tabBarIcon: tabIcon('bicycle-outline') }}
      />
      <Tabs.Screen
        name="restaurants"
        options={{
          title: t('courier.tabs.restaurants'),
          tabBarIcon: tabIcon('storefront-outline'),
        }}
      />
      <Tabs.Screen
        name="revenus"
        options={{ title: t('courier.tabs.earnings'), tabBarIcon: tabIcon('wallet-outline') }}
      />
      <Tabs.Screen
        name="compte"
        options={{ title: t('courier.tabs.account'), tabBarIcon: tabIcon('person-outline') }}
      />
    </Tabs>
  );
}
