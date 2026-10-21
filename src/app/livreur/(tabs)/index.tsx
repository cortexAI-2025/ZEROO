import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, QueryState, Screen, SwitchRow } from '@/components/ui';
import { useBilling } from '@/features/billing/billing';
import {
  useActiveRuns,
  useCourierActions,
  useCourierStops,
  useCurrentCourier,
  useMissions,
  useMyLinks,
} from '@/features/courier/hooks';
import { MissionCard } from '@/features/courier/MissionCard';
import { useCourierPresence } from '@/features/courier/presence';
import { RunCard } from '@/features/courier/RunCard';
import { NotificationsPrompt } from '@/features/notifications/NotificationsPrompt';
import { formatTime } from '@/lib/dates';
import { errorKey } from '@/lib/errors';
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus';
import { spacing } from '@/theme';

/** Tableau de bord du livreur : disponibilité et courses en cours, en temps réel. */
export default function CourierRunsScreen() {
  const { t } = useTranslation();
  const courier = useCurrentCourier();
  const runs = useActiveRuns(courier.id);
  const missions = useMissions(courier.id);
  const stops = useCourierStops(courier.id, (runs.data?.length ?? 0) > 0);
  const links = useMyLinks(courier.id);
  const billing = useBilling({ role: 'courier', id: courier.id });
  const actions = useCourierActions();
  const online = useCourierPresence(courier);
  useRefreshOnFocus(billing.refetch);

  const paymentsReady = !!courier.payment_link;
  const subscribed = ['trialing', 'active'].includes(billing.data?.subscription?.status ?? '');
  const hasMerchant = (links.data ?? []).some((l) => l.status === 'approved');
  const ready = paymentsReady && subscribed && hasMerchant;
  const checklist = [
    { done: paymentsReady, label: t('courier.runs.setupPayments'), href: '/livreur/compte' },
    { done: subscribed, label: t('courier.runs.setupSubscription'), href: '/livreur/compte' },
    { done: hasMerchant, label: t('courier.runs.setupMerchant'), href: '/livreur/restaurants' },
  ] as const;

  return (
    <Screen scroll>
      <AppText variant="title">{t('courier.runs.title')}</AppText>

      {!billing.isPending && !links.isPending && !ready ? (
        <Card testID="courier-setup">
          <AppText variant="subtitle">{t('courier.runs.setupTitle')}</AppText>
          {checklist.map((item) => (
            <View key={item.label} style={styles.check}>
              <AppText style={styles.flex}>
                {item.done ? '✅' : '⬜️'} {item.label}
              </AppText>
              {!item.done ? (
                <Button
                  variant="ghost"
                  title={t('courier.runs.setupGo')}
                  onPress={() => router.push(item.href)}
                />
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <SwitchRow
          testID="availability-switch"
          label={t('courier.runs.available')}
          hint={t('courier.runs.availableHint')}
          value={online}
          disabled={actions.setAvailability.isPending || (!online && !ready)}
          onValueChange={(value) => actions.setAvailability.mutate(value)}
        />
        {actions.setAvailability.error ? (
          <AppText variant="error">{t(errorKey(actions.setAvailability.error))}</AppText>
        ) : null}
      </Card>

      <NotificationsPrompt audience="courier" />

      {ready && online && (missions.data?.length ?? 0) > 0 ? (
        <>
          <AppText variant="subtitle">{t('courier.runs.missionsTitle')}</AppText>
          <AppText variant="muted">{t('courier.runs.missionsHint')}</AppText>
          {missions.data?.map((mission) => (
            <MissionCard key={mission.order_id} mission={mission} />
          ))}
        </>
      ) : null}

      {(stops.data?.length ?? 0) > 1 ? (
        <Card testID="courier-tour">
          <AppText variant="subtitle">{t('courier.runs.tourTitle')}</AppText>
          {stops.data?.map((s) => (
            <AppText key={`${s.kind}-${s.order_id}`}>
              {s.kind === 'pickup'
                ? t('courier.runs.tourPickup', { name: s.label })
                : t('courier.runs.tourDropoff', { city: s.label })}
              {' · '}
              {t('courier.runs.tourStop', { no: s.stop_no, time: formatTime(s.eta) })}
            </AppText>
          ))}
          <AppText variant="muted">{t('courier.runs.tourHint')}</AppText>
        </Card>
      ) : null}

      {runs.data ? (
        runs.data.length === 0 ? (
          <AppText variant="muted">{t('courier.runs.empty')}</AppText>
        ) : (
          runs.data.map((run) => <RunCard key={run.id} run={run} />)
        )
      ) : (
        <QueryState error={runs.error} onRetry={() => void runs.refetch()} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
