import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, useThemeColors } from '@/theme';
import { useIsOnline } from '@/lib/network';

/** Bandeau affiché tant que le navigateur est hors connexion : les données montrées peuvent être anciennes. */
export function OfflineBanner() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const online = useIsOnline();
  if (online) return null;
  return (
    <View
      accessibilityRole="alert"
      testID="offline-banner"
      style={[styles.bar, { backgroundColor: colors.danger }]}>
      <Text style={[styles.text, { color: colors.onBrand }]}>{t('common.offlineBanner')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  text: { textAlign: 'center', fontWeight: '600' },
});
