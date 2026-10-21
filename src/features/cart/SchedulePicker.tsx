import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, Chip, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/theme';

import {
  type ClosureRow,
  groupLeadMinutes,
  type HoursRow,
  isoToSlot,
  scheduleLeadMinutes,
  scheduleOptions,
  slotToIso,
} from './schedule';
import type { GroupOrder } from './store';

export type SchedulableMerchant = {
  default_prep_minutes: number;
  group_orders_enabled: boolean;
  group_min_lead_hours: number;
  group_min_headcount: number;
  group_min_total_cents: number;
};

/** Horaires et fermetures publics de l'établissement (lecture publique). */
function useOpeningData(merchantId: string) {
  return useQuery({
    queryKey: ['merchant-schedule', merchantId],
    queryFn: async () => {
      const [hours, closures] = await Promise.all([
        supabase
          .from('merchant_opening_hours')
          .select('weekday, opens_at, closes_at')
          .eq('merchant_id', merchantId),
        supabase
          .from('merchant_closures')
          .select('starts_at, ends_at')
          .eq('merchant_id', merchantId)
          .gt('ends_at', new Date().toISOString()),
      ]);
      if (hours.error) throw hours.error;
      if (closures.error) throw closures.error;
      return { hours: hours.data as HoursRow[], closures: closures.data as ClosureRow[] };
    },
    staleTime: 60_000,
  });
}

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

/**
 * Quand ? « Dès que possible » ou un créneau de 15 minutes sur 14 jours (précommande, Start et Pro),
 * puis, pour un établissement Pro qui l'accepte, la commande groupée entreprise.
 */
export function SchedulePicker({
  merchantId,
  merchant,
  scheduledFor,
  onSchedule,
  group,
  onGroup,
}: {
  merchantId: string;
  merchant: SchedulableMerchant;
  scheduledFor: string | null;
  onSchedule: (iso: string | null) => void;
  group: GroupOrder | null;
  onGroup: (group: GroupOrder | null) => void;
}) {
  const { t } = useTranslation();
  const data = useOpeningData(merchantId);
  const [day, setDay] = useState<string | null>(null);
  const lead = group
    ? groupLeadMinutes(merchant.group_min_lead_hours)
    : scheduleLeadMinutes(merchant.default_prep_minutes);
  const options = data.data
    ? scheduleOptions({ ...data.data, now: new Date(), leadMinutes: lead })
    : [];
  const selectedDay = day ?? options[0]?.day ?? null;
  const times = options.find((o) => o.day === selectedDay)?.times ?? [];
  const chosen = scheduledFor ? isoToSlot(scheduledFor) : null;

  return (
    <Card testID="schedule">
      <AppText variant="subtitle">{t('client.schedule.title')}</AppText>
      <View style={styles.chips}>
        <Chip
          testID="schedule-asap"
          label={t('client.schedule.asap')}
          selected={!scheduledFor}
          onPress={() => onSchedule(null)}
        />
        <Chip
          testID="schedule-later"
          label={t('client.schedule.later')}
          selected={!!scheduledFor}
          onPress={() => {
            const first = options[0];
            if (first) {
              setDay(first.day);
              onSchedule(slotToIso(first.day, first.times[0]));
            }
          }}
        />
      </View>
      {scheduledFor ? (
        <>
          <View style={styles.chips}>
            {options.slice(0, 14).map((o) => (
              <Chip
                key={o.day}
                testID={`schedule-day-${o.day}`}
                label={dayLabel(o.day)}
                selected={selectedDay === o.day}
                onPress={() => {
                  setDay(o.day);
                  onSchedule(slotToIso(o.day, o.times[0]));
                }}
              />
            ))}
          </View>
          <View style={styles.chips}>
            {times.map((time) => (
              <Chip
                key={time}
                testID={`schedule-time-${time}`}
                label={time}
                selected={chosen?.time === time && chosen.day === selectedDay}
                onPress={() => selectedDay && onSchedule(slotToIso(selectedDay, time))}
              />
            ))}
          </View>
          <AppText variant="muted">{t('client.schedule.hint')}</AppText>
        </>
      ) : (
        <>
          {options.length === 0 && data.data ? (
            <AppText variant="muted">{t('client.schedule.none')}</AppText>
          ) : (
            <AppText variant="muted">{t('client.schedule.asapHint')}</AppText>
          )}
        </>
      )}

      {merchant.group_orders_enabled ? (
        <>
          <Chip
            testID="group-toggle"
            label={`🏢 ${t('client.schedule.group')}`}
            selected={!!group}
            onPress={() => {
              if (group) {
                onGroup(null);
              } else {
                onGroup({ companyName: '', headcount: merchant.group_min_headcount });
                // Une commande groupée est toujours programmée, avec un délai plus long.
                const first = scheduleOptions({
                  ...(data.data ?? { hours: [], closures: [] }),
                  now: new Date(),
                  leadMinutes: groupLeadMinutes(merchant.group_min_lead_hours),
                })[0];
                if (first) {
                  setDay(first.day);
                  onSchedule(slotToIso(first.day, first.times[0]));
                }
              }
            }}
          />
          {group ? (
            <>
              <TextField
                testID="group-company"
                label={t('client.schedule.company')}
                value={group.companyName}
                onChangeText={(companyName) => onGroup({ ...group, companyName })}
                maxLength={120}
              />
              <TextField
                testID="group-headcount"
                label={t('client.schedule.headcount', { min: merchant.group_min_headcount })}
                value={String(group.headcount || '')}
                onChangeText={(v) =>
                  onGroup({ ...group, headcount: Number(v.replace(/\D/g, '')) || 0 })
                }
                keyboardType="number-pad"
                maxLength={4}
              />
              <AppText variant="muted">
                {t('client.schedule.groupHint', { hours: merchant.group_min_lead_hours })}
              </AppText>
            </>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
