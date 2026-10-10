import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Badge, Card } from '@/components/ui';
import type { MerchantCategory } from '@/features/merchant/types';
import { spacing } from '@/theme';

import type { MerchantSummary } from './api';
import { formatDistance } from './location';

export function MerchantCard({ merchant }: { merchant: MerchantSummary }) {
  const { t } = useTranslation();
  const status = merchant.is_accepting_orders ? 'open' : merchant.is_open ? 'paused' : 'closed';
  return (
    <Pressable
      accessibilityRole="button"
      testID={`merchant-${merchant.slug}`}
      onPress={() => router.push({ pathname: '/m/[slug]', params: { slug: merchant.slug } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      <Card>
        <View style={styles.row}>
          <AppText variant="subtitle" style={styles.flex}>
            {merchant.name}
          </AppText>
          <Badge
            label={t(`merchant.status.${status}`)}
            tone={status === 'open' ? 'success' : status === 'paused' ? 'warning' : 'neutral'}
          />
        </View>
        <AppText variant="muted">
          {t(`merchant.categories.${merchant.category as MerchantCategory}`)} ·{' '}
          {merchant.address_line}, {merchant.city}
          {merchant.distance_m !== null ? ` · ${formatDistance(merchant.distance_m)}` : ''}
        </AppText>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
