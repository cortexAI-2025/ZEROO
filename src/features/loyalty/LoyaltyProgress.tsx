import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { spacing, useThemeColors } from '@/theme';

import { MENUS_PER_REWARD } from './hooks';

type Props = { paidMenus: number; rewardsAvailable: number; testID?: string };

/** Tampons de la carte : 9 cases, et le nombre de menus offerts disponibles. */
export function LoyaltyProgress({ paidMenus, rewardsAvailable, testID }: Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const remaining = MENUS_PER_REWARD - paidMenus;
  return (
    <View style={styles.container} testID={testID}>
      <View
        style={styles.stamps}
        accessible
        accessibilityLabel={t('client.loyalty.progress', {
          count: paidMenus,
          total: MENUS_PER_REWARD,
        })}>
        {Array.from({ length: MENUS_PER_REWARD }, (_, i) => (
          <View
            key={i}
            style={[
              styles.stamp,
              {
                borderColor: colors.brand,
                backgroundColor: i < paidMenus ? colors.brand : 'transparent',
              },
            ]}
          />
        ))}
      </View>
      <AppText variant="muted">
        {t('client.loyalty.progress', { count: paidMenus, total: MENUS_PER_REWARD })} ·{' '}
        {t('client.loyalty.remaining', { count: remaining })}
      </AppText>
      {rewardsAvailable > 0 ? (
        <AppText variant="link">
          {t('client.loyalty.rewardsAvailable', { count: rewardsAvailable })}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  stamps: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  stamp: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
});
