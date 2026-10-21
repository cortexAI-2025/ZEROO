import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Badge, Button, Card } from '@/components/ui';
import { useCurrentMerchant, useMyMerchant, useTodaySummary } from '@/features/merchant/hooks';
import { merchantStatus } from '@/features/merchant/status';
import {
  useActiveOrders,
  useNewOrderAlert,
  useSetOrderStatus,
} from '@/features/merchant-orders/hooks';
import { OrderCard } from '@/features/merchant-orders/OrderCard';
import type { Order } from '@/features/merchant-orders/types';
import { NotificationsPrompt } from '@/features/notifications/NotificationsPrompt';
import { formatCents } from '@/lib/money';
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus';
import { spacing, useThemeColors } from '@/theme';

const STATUS_TONE = {
  open: 'success',
  closed: 'neutral',
  paused: 'warning',
  unpublished: 'danger',
  noMode: 'danger',
  setup: 'danger',
} as const;

export default function MerchantOrdersScreen() {
  useKeepAwake(); // tablette ou téléphone posé en caisse : l'écran reste allumé
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const merchant = useCurrentMerchant();
  useRefreshOnFocus(useMyMerchant().refetch);
  const orders = useActiveOrders(merchant.id);
  const summary = useTodaySummary(merchant.id);
  const setStatus = useSetOrderStatus(merchant.id);
  // Les navigateurs bloquent le son tant que l'utilisateur n'a pas interagi avec la page.
  const [soundEnabled, setSoundEnabled] = useState(Platform.OS !== 'web');

  const all = orders.data ?? [];
  const columns: { key: string; title: string; orders: Order[] }[] = [
    {
      key: 'new',
      title: t('merchant.orders.new'),
      orders: all.filter((o) => o.status === 'placed'),
    },
    {
      key: 'progress',
      title: t('merchant.orders.inProgress'),
      orders: all.filter((o) => o.status === 'accepted' || o.status === 'preparing'),
    },
    {
      key: 'ready',
      title: t('merchant.orders.ready'),
      orders: all.filter((o) => o.status === 'ready'),
    },
  ];
  useNewOrderAlert(
    columns[0].orders.map((o) => o.id),
    soundEnabled,
  );

  const status = merchantStatus(merchant);
  const wide = width >= 900;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <AppText variant="title">{merchant.name}</AppText>
            <AppText variant="muted">
              {t(
                status === 'open'
                  ? 'merchant.status.acceptingOrders'
                  : 'merchant.status.notAccepting',
              )}
            </AppText>
          </View>
          <Badge
            testID="merchant-status"
            label={t(`merchant.status.${status}`)}
            tone={STATUS_TONE[status]}
          />
        </View>

        {status === 'setup' ? (
          <Card testID="setup-banner">
            <AppText>{t('merchant.orders.setupBanner')}</AppText>
            <Button
              variant="secondary"
              title={t('merchant.tabs.shop')}
              onPress={() => router.push('/pro/shop')}
            />
          </Card>
        ) : null}

        {status === 'noMode' ? (
          <Card testID="no-mode-banner">
            <AppText>{t('merchant.status.noMode')}</AppText>
            <Button
              variant="secondary"
              title={t('merchant.tabs.shop')}
              onPress={() => router.push('/pro/shop')}
            />
          </Card>
        ) : null}

        <NotificationsPrompt audience="merchant" />

        <Card>
          <AppText variant="muted">{t('merchant.orders.today')}</AppText>
          <View style={styles.summary}>
            <AppText variant="subtitle" testID="today-revenue">
              {formatCents(Number(summary.data?.revenue_cents ?? 0))}
            </AppText>
            <AppText variant="muted">
              {t('merchant.orders.ordersCount', { count: summary.data?.orders_count ?? 0 })}
            </AppText>
          </View>
        </Card>

        {!soundEnabled ? (
          <Card>
            <AppText variant="muted">{t('merchant.orders.soundOff')}</AppText>
            <Button
              variant="secondary"
              title={t('merchant.orders.enableSound')}
              onPress={() => setSoundEnabled(true)}
            />
          </Card>
        ) : null}

        {all.length === 0 && !orders.isPending ? (
          <AppText variant="muted">{t('merchant.orders.empty')}</AppText>
        ) : (
          <View style={wide ? styles.columns : styles.stack}>
            {columns.map((column) => (
              <View key={column.key} style={[styles.column, wide && styles.flex]}>
                <AppText variant="subtitle">
                  {column.title} ({column.orders.length})
                </AppText>
                {column.orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    defaultPrepMinutes={merchant.default_prep_minutes}
                    timezone={merchant.timezone}
                    onChange={async (change) => {
                      await setStatus.mutateAsync(change);
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
        )}

        <Button
          variant="ghost"
          title={t('merchant.orders.history')}
          onPress={() => router.push('/pro/history')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  summary: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  columns: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stack: { gap: spacing.lg },
  column: { gap: spacing.sm },
});
