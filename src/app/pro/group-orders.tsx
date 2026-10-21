import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, Chip, Screen, SwitchRow } from '@/components/ui';
import { ProUpsell } from '@/features/billing/ProUpsell';
import { useMerchantPlan } from '@/features/billing/useMerchantPlan';
import { useCurrentMerchant, useUpdateMerchant } from '@/features/merchant/hooks';
import { errorKey } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { spacing } from '@/theme';

const LEAD_HOURS = [4, 12, 24, 48, 72];
const HEADCOUNTS = [5, 10, 20, 50];
const MIN_TOTALS = [0, 10000, 20000, 50000];

/** Commandes groupées entreprises (formule Pro) : activation, délai, effectif et montant minimaux. */
export default function GroupOrdersScreen() {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const update = useUpdateMerchant(merchant.id);
  const plan = useMerchantPlan(merchant.id);

  if (!plan.isLoading && !plan.has('group_orders')) {
    return (
      <Screen scroll>
        <ProUpsell feature={t('merchant.groupOrders.proFeature')} />
      </Screen>
    );
  }

  const pick = (values: number[], current: number) =>
    [...new Set([...values, current])].sort((a, b) => a - b);

  return (
    <Screen scroll>
      <AppText variant="muted">{t('merchant.groupOrders.hint')}</AppText>
      <Card>
        <SwitchRow
          testID="group-orders-switch"
          label={t('merchant.groupOrders.enabled')}
          value={merchant.group_orders_enabled}
          onValueChange={(value) => update.mutate({ group_orders_enabled: value })}
        />
      </Card>
      {merchant.group_orders_enabled ? (
        <Card>
          <AppText variant="subtitle">{t('merchant.groupOrders.leadHours')}</AppText>
          <View style={styles.chips}>
            {pick(LEAD_HOURS, merchant.group_min_lead_hours).map((h) => (
              <Chip
                key={h}
                testID={`group-lead-${h}`}
                label={t('merchant.groupOrders.leadHoursValue', { count: h })}
                selected={merchant.group_min_lead_hours === h}
                onPress={() => update.mutate({ group_min_lead_hours: h })}
              />
            ))}
          </View>
          <AppText variant="subtitle">{t('merchant.groupOrders.minHeadcount')}</AppText>
          <View style={styles.chips}>
            {pick(HEADCOUNTS, merchant.group_min_headcount).map((n) => (
              <Chip
                key={n}
                testID={`group-headcount-${n}`}
                label={String(n)}
                selected={merchant.group_min_headcount === n}
                onPress={() => update.mutate({ group_min_headcount: n })}
              />
            ))}
          </View>
          <AppText variant="subtitle">{t('merchant.groupOrders.minTotal')}</AppText>
          <View style={styles.chips}>
            {pick(MIN_TOTALS, merchant.group_min_total_cents).map((c) => (
              <Chip
                key={c}
                testID={`group-total-${c}`}
                label={c === 0 ? t('merchant.groupOrders.noMinimum') : formatCents(c)}
                selected={merchant.group_min_total_cents === c}
                onPress={() => update.mutate({ group_min_total_cents: c })}
              />
            ))}
          </View>
        </Card>
      ) : null}
      {update.error ? <AppText variant="error">{t(errorKey(update.error))}</AppText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
