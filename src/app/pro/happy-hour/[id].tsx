import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  Chip,
  QueryState,
  Screen,
  SwitchRow,
  TextField,
} from '@/components/ui';
import {
  emptyForm,
  type FormErrorKey,
  formFromOffer,
  type HappyHourForm,
  validateForm,
  type WindowForm,
} from '@/features/happyhour/form';
import { useHappyHourActions, useHappyHours } from '@/features/happyhour/hooks';
import { useMenu } from '@/features/menu/hooks';
import { WEEKDAYS } from '@/features/merchant/hours';
import { useCurrentMerchant } from '@/features/merchant/hooks';
import { errorKey } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { radius, spacing, useThemeColors } from '@/theme';

function OfferForm({ id, initial }: { id: string | null; initial: HappyHourForm }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const merchant = useCurrentMerchant();
  const menu = useMenu(merchant.id);
  const actions = useHappyHourActions(merchant.id);
  const [form, setForm] = useState<HappyHourForm>(initial);
  const [errors, setErrors] = useState<FormErrorKey[]>([]);

  const items = (menu.data ?? []).flatMap((c) =>
    c.menu_items.map((i) => ({ ...i, category: c.name })),
  );
  const catalog = new Map(items.map((i) => [i.id, { price_cents: i.price_cents }]));
  const patch = (changes: Partial<HappyHourForm>) => setForm((f) => ({ ...f, ...changes }));
  const patchWindow = (index: number, changes: Partial<WindowForm>) =>
    patch({ windows: form.windows.map((w, i) => (i === index ? { ...w, ...changes } : w)) });
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  const error = (key: FormErrorKey) =>
    errors.includes(key) ? t(`merchant.happyHours.errors.${key}`) : undefined;

  const onSave = () => {
    const result = validateForm(form, catalog);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    actions.save.mutate({ id, input: result.input }, { onSuccess: () => router.back() });
  };

  const input = [
    styles.input,
    { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
  ];

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: t(id ? 'merchant.happyHours.editTitle' : 'merchant.happyHours.newTitle'),
        }}
      />
      <TextField
        testID="happy-hour-name"
        label={t('merchant.happyHours.name')}
        value={form.name}
        onChangeText={(name) => patch({ name })}
        maxLength={60}
        error={error('name')}
      />

      <Card>
        <AppText variant="subtitle">{t('merchant.happyHours.discount')}</AppText>
        <View style={styles.chips}>
          <Chip
            label={t('merchant.happyHours.percent')}
            selected={form.discountType === 'percent'}
            onPress={() => patch({ discountType: 'percent' })}
          />
          <Chip
            label={t('merchant.happyHours.fixedPrice')}
            selected={form.discountType === 'price'}
            onPress={() => patch({ discountType: 'price' })}
          />
        </View>
        {form.discountType === 'percent' ? (
          <TextField
            testID="happy-hour-percent"
            label={t('merchant.happyHours.percentLabel')}
            value={form.percent}
            onChangeText={(percent) => patch({ percent })}
            keyboardType="number-pad"
            error={error('percent')}
          />
        ) : (
          <AppText variant="muted">{t('merchant.happyHours.priceHint')}</AppText>
        )}
        <AppText variant="muted">{t('merchant.happyHours.referenceHint')}</AppText>
      </Card>

      <Card>
        <AppText variant="subtitle">{t('merchant.happyHours.productsTitle')}</AppText>
        {error('items') ? <AppText variant="error">{error('items')}</AppText> : null}
        {items.map((item) => {
          const selected = form.itemIds.includes(item.id);
          return (
            <View key={item.id} style={styles.itemRow}>
              <Chip
                label={`${item.name} · ${formatCents(item.price_cents)}`}
                selected={selected}
                onPress={() => patch({ itemIds: toggle(form.itemIds, item.id) })}
              />
              {selected && form.discountType === 'price' ? (
                <TextInput
                  accessibilityLabel={`${item.name} ${t('merchant.happyHours.promoPrice')}`}
                  value={form.prices[item.id] ?? ''}
                  onChangeText={(v) => patch({ prices: { ...form.prices, [item.id]: v } })}
                  placeholder={t('merchant.happyHours.promoPrice')}
                  keyboardType="decimal-pad"
                  style={input}
                />
              ) : null}
            </View>
          );
        })}
        {error('prices') ? <AppText variant="error">{error('prices')}</AppText> : null}
      </Card>

      <Card>
        <AppText variant="subtitle">{t('merchant.happyHours.windowsTitle')}</AppText>
        <AppText variant="muted">{t('merchant.happyHours.windowsHint')}</AppText>
        {form.windows.map((w, index) => (
          <View key={index} style={styles.window}>
            <View style={styles.chips}>
              {WEEKDAYS.map((d) => (
                <Chip
                  key={d}
                  label={t(`merchant.hours.days.${d}`).slice(0, 3)}
                  selected={w.weekdays.includes(d)}
                  onPress={() => patchWindow(index, { weekdays: toggle(w.weekdays, d) })}
                />
              ))}
            </View>
            <View style={styles.times}>
              <TextInput
                accessibilityLabel={t('merchant.hours.opens')}
                value={w.start}
                onChangeText={(start) => patchWindow(index, { start })}
                placeholder="17:00"
                style={input}
              />
              <AppText>→</AppText>
              <TextInput
                accessibilityLabel={t('merchant.hours.closes')}
                value={w.end}
                onChangeText={(end) => patchWindow(index, { end })}
                placeholder="19:00"
                style={input}
              />
              {form.windows.length > 1 ? (
                <Button
                  variant="ghost"
                  title={t('common.delete')}
                  onPress={() => patch({ windows: form.windows.filter((_, i) => i !== index) })}
                />
              ) : null}
            </View>
          </View>
        ))}
        <Button
          variant="ghost"
          title={`+ ${t('merchant.happyHours.addWindow')}`}
          onPress={() =>
            patch({
              windows: [...form.windows, { weekdays: [6, 7], start: '17:00', end: '19:00' }],
            })
          }
        />
        {error('windows') ? <AppText variant="error">{error('windows')}</AppText> : null}
      </Card>

      <Card>
        <AppText variant="subtitle">{t('merchant.happyHours.validityTitle')}</AppText>
        <TextField
          label={t('merchant.happyHours.validFrom')}
          value={form.validFrom}
          onChangeText={(validFrom) => patch({ validFrom })}
          placeholder="01/11/2026"
        />
        <TextField
          label={t('merchant.happyHours.validTo')}
          value={form.validTo}
          onChangeText={(validTo) => patch({ validTo })}
          placeholder="30/11/2026"
          error={error('validity')}
        />
        <TextField
          testID="happy-hour-quantity"
          label={t('merchant.happyHours.quantity')}
          value={form.quantity}
          onChangeText={(quantity) => patch({ quantity })}
          keyboardType="number-pad"
          error={error('quantity')}
        />
        <AppText variant="muted">{t('merchant.happyHours.quantityHint')}</AppText>
      </Card>

      <Card>
        <AppText variant="subtitle">{t('merchant.happyHours.appliesTo')}</AppText>
        <SwitchRow
          label={t('merchant.happyHours.modePickup')}
          value={form.pickup}
          onValueChange={(pickup) => patch({ pickup })}
        />
        <SwitchRow
          label={t('merchant.happyHours.modeDelivery')}
          value={form.delivery}
          onValueChange={(delivery) => patch({ delivery })}
        />
        {error('modes') ? <AppText variant="error">{error('modes')}</AppText> : null}
        <SwitchRow
          label={t('merchant.happyHours.active')}
          value={form.active}
          onValueChange={(active) => patch({ active })}
        />
      </Card>

      {actions.save.error ? (
        <AppText variant="error">{t(errorKey(actions.save.error))}</AppText>
      ) : null}
      <Button
        testID="happy-hour-save"
        title={t('common.save')}
        loading={actions.save.isPending}
        onPress={onSave}
      />
    </Screen>
  );
}

export default function HappyHourScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const merchant = useCurrentMerchant();
  const offers = useHappyHours(merchant.id);

  if (id === 'new') return <OfferForm id={null} initial={emptyForm()} />;
  if (!offers.data)
    return <QueryState error={offers.error} onRetry={() => void offers.refetch()} />;
  const offer = offers.data.find((o) => o.id === id);
  if (!offer) return <QueryState />;
  return <OfferForm key={offer.id} id={offer.id} initial={formFromOffer(offer)} />;
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  itemRow: { gap: spacing.xs },
  window: { gap: spacing.sm },
  times: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    width: 100,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.sm,
    textAlign: 'center',
    fontSize: 16,
    paddingHorizontal: spacing.sm,
  },
});
