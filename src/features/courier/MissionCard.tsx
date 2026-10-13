import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card } from '@/components/ui';
import { formatDistance } from '@/features/discover/location';
import { formatTime } from '@/lib/dates';
import { errorKey } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { spacing } from '@/theme';

import { useCourierActions } from './hooks';
import type { Mission } from './types';

/**
 * Une mission proposée à tous les livreurs rattachés au restaurant : le premier qui accepte
 * l'obtient. L'adresse précise du client n'est révélée qu'après l'acceptation.
 */
export function MissionCard({ mission }: { mission: Mission }) {
  const { t } = useTranslation();
  const actions = useCourierActions();
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setError(null);
    try {
      await actions.accept.mutateAsync(mission.order_id);
    } catch (e) {
      setError(t(errorKey(e)));
    }
  };

  const prep =
    mission.status === 'ready'
      ? t('courier.runs.missionReadyNow')
      : mission.estimated_ready_at
        ? t('courier.runs.missionReady', { time: formatTime(mission.estimated_ready_at) })
        : t('courier.runs.missionPreparing');

  return (
    <Card testID={`mission-${mission.order_id}`}>
      <View style={styles.header}>
        <AppText variant="subtitle">
          {t('courier.runs.missionTo', {
            name: mission.merchant_name,
            city: mission.delivery_city ?? '',
          })}
        </AppText>
        <Badge label={formatCents(mission.delivery_fee_cents)} tone="success" />
      </View>
      <AppText>
        {t('courier.runs.missionPickup', {
          name: mission.merchant_name,
          address: `${mission.merchant_address}, ${mission.merchant_city}`,
        })}
      </AppText>
      {mission.delivery_distance_m != null ? (
        <AppText variant="muted">
          {t('courier.runs.distance', { distance: formatDistance(mission.delivery_distance_m) })}
        </AppText>
      ) : null}
      <AppText variant="muted">
        {prep} ·{' '}
        {mission.payment_method === 'cash' ? t('courier.runs.payCash') : t('courier.runs.payCard')}
      </AppText>
      <Button
        testID={`accept-mission-${mission.order_id}`}
        title={t('courier.runs.accept')}
        loading={actions.accept.isPending}
        onPress={() => void accept()}
      />
      {error ? <AppText variant="error">{error}</AppText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
