import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button, Card, QueryState, Screen } from '@/components/ui';
import { shortTime, type Slot, validateSlots, WEEKDAYS } from '@/features/merchant/hours';
import {
  useCurrentMerchant,
  useOpeningHours,
  useSaveOpeningHours,
} from '@/features/merchant/hooks';
import type { OpeningHour } from '@/features/merchant/types';
import { errorKey } from '@/lib/errors';
import { radius, spacing, useThemeColors } from '@/theme';

type DraftSlot = Slot & { key: string };

let nextKey = 0;
const withKey = (slot: Slot): DraftSlot => ({ ...slot, key: String(nextKey++) });

function HoursEditor({ initial, merchantId }: { initial: OpeningHour[]; merchantId: string }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const save = useSaveOpeningHours(merchantId);
  const [slots, setSlots] = useState<DraftSlot[]>(() =>
    initial.map((h) =>
      withKey({
        weekday: h.weekday,
        opensAt: shortTime(h.opens_at),
        closesAt: shortTime(h.closes_at),
      }),
    ),
  );
  const [invalidDay, setInvalidDay] = useState<(typeof WEEKDAYS)[number] | null>(null);

  const update = (key: string, patch: Partial<Slot>) =>
    setSlots((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const copyMonday = () => {
    const monday = slots.filter((s) => s.weekday === 1);
    setSlots(WEEKDAYS.flatMap((weekday) => monday.map((s) => withKey({ ...s, weekday }))));
  };

  const onSave = () => {
    const result = validateSlots(slots);
    if (!result.ok) {
      setInvalidDay(slots[result.index].weekday as (typeof WEEKDAYS)[number]);
      return;
    }
    setInvalidDay(null);
    save.mutate(result.slots, { onSuccess: () => router.back() });
  };

  const input = [
    styles.input,
    { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
  ];

  return (
    <Screen scroll>
      <AppText variant="muted">{t('merchant.hours.hint')}</AppText>
      {WEEKDAYS.map((weekday) => {
        const daySlots = slots.filter((s) => s.weekday === weekday);
        const day = t(`merchant.hours.days.${weekday}`);
        return (
          <Card key={weekday} testID={`day-${weekday}`}>
            <AppText variant="subtitle">{day}</AppText>
            {daySlots.length === 0 ? (
              <AppText variant="muted">{t('merchant.hours.closed')}</AppText>
            ) : null}
            {daySlots.map((slot) => (
              <View key={slot.key} style={styles.row}>
                <TextInput
                  accessibilityLabel={`${day} ${t('merchant.hours.opens')}`}
                  value={slot.opensAt}
                  onChangeText={(v) => update(slot.key, { opensAt: v })}
                  placeholder="11:30"
                  style={input}
                />
                <AppText>→</AppText>
                <TextInput
                  accessibilityLabel={`${day} ${t('merchant.hours.closes')}`}
                  value={slot.closesAt}
                  onChangeText={(v) => update(slot.key, { closesAt: v })}
                  placeholder="14:30"
                  style={input}
                />
                <Pressable
                  accessibilityLabel={t('common.delete')}
                  onPress={() => setSlots((all) => all.filter((s) => s.key !== slot.key))}
                  hitSlop={8}>
                  <Ionicons name="close-circle-outline" size={24} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
            <Button
              variant="ghost"
              title={`+ ${t('merchant.hours.addSlot')}`}
              onPress={() =>
                setSlots((all) => [
                  ...all,
                  withKey({ weekday, opensAt: '11:30', closesAt: '14:30' }),
                ])
              }
            />
          </Card>
        );
      })}
      <Button variant="secondary" title={t('merchant.hours.copyMonday')} onPress={copyMonday} />
      {invalidDay ? (
        <AppText variant="error">
          {t('merchant.hours.invalidSlot', { day: t(`merchant.hours.days.${invalidDay}`) })}
        </AppText>
      ) : null}
      {save.error ? <AppText variant="error">{t(errorKey(save.error))}</AppText> : null}
      <Button
        testID="hours-save"
        title={t('common.save')}
        loading={save.isPending}
        onPress={onSave}
      />
    </Screen>
  );
}

export default function HoursScreen() {
  const merchant = useCurrentMerchant();
  const hours = useOpeningHours(merchant.id);
  if (!hours.data) return <QueryState error={hours.error} onRetry={() => void hours.refetch()} />;
  return <HoursEditor initial={hours.data} merchantId={merchant.id} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    width: 80,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.sm,
    textAlign: 'center',
    fontSize: 16,
  },
});
