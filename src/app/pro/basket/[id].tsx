import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

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
import { useBasketActions, useMerchantBaskets } from '@/features/baskets/hooks';
import {
  type BasketErrorKey,
  type BasketForm,
  basketToForm,
  emptyBasketForm,
  validateBasket,
} from '@/features/baskets/form';
import { ALLERGENS } from '@/features/baskets/types';
import { useCurrentMerchant } from '@/features/merchant/hooks';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme';

function BasketEditor({ id, initial }: { id: string | null; initial: BasketForm }) {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const actions = useBasketActions(merchant.id);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<BasketErrorKey[]>([]);
  const patch = (changes: Partial<BasketForm>) => setForm((f) => ({ ...f, ...changes }));
  const error = (key: BasketErrorKey) =>
    errors.includes(key) ? t(`merchant.baskets.errors.${key}`) : undefined;

  const onSave = () => {
    const result = validateBasket(form, new Date());
    if (!result.ok) return setErrors(result.errors);
    setErrors([]);
    actions.save.mutate({ id, input: result.input }, { onSuccess: () => router.back() });
  };

  return (
    <Screen scroll>
      <Stack.Screen
        options={{ title: t(id ? 'merchant.baskets.editTitle' : 'merchant.baskets.newTitle') }}
      />
      <TextField
        testID="basket-title"
        label={t('merchant.baskets.titleLabel')}
        value={form.title}
        onChangeText={(title) => patch({ title })}
        maxLength={60}
        error={error('title')}
      />
      <SwitchRow
        label={t('merchant.baskets.surprise')}
        hint={t('merchant.baskets.surpriseHint')}
        value={form.isSurprise}
        onValueChange={(isSurprise) => patch({ isSurprise })}
      />
      <TextField
        testID="basket-contents"
        label={t(
          form.isSurprise ? 'merchant.baskets.contentsOptional' : 'merchant.baskets.contents',
        )}
        value={form.contents}
        onChangeText={(contents) => patch({ contents })}
        multiline
        maxLength={300}
        error={error('contents')}
      />
      <Card>
        <TextField
          testID="basket-price"
          label={t('merchant.baskets.price')}
          value={form.price}
          onChangeText={(price) => patch({ price })}
          keyboardType="decimal-pad"
          placeholder="3,99"
          error={error('price')}
        />
        <TextField
          label={t('merchant.baskets.value')}
          value={form.value}
          onChangeText={(value) => patch({ value })}
          keyboardType="decimal-pad"
          error={error('value')}
        />
        <AppText variant="muted">{t('merchant.baskets.valueHint')}</AppText>
        <TextField
          testID="basket-quantity"
          label={t('merchant.baskets.quantity')}
          value={form.quantity}
          onChangeText={(quantity) => patch({ quantity })}
          keyboardType="number-pad"
          error={error('quantity')}
        />
      </Card>
      <Card>
        <AppText variant="subtitle">{t('merchant.baskets.pickup')}</AppText>
        <View style={styles.chips}>
          <Chip
            label={t('merchant.baskets.today')}
            selected={form.dayOffset === 0}
            onPress={() => patch({ dayOffset: 0 })}
          />
          <Chip
            label={t('merchant.baskets.tomorrow')}
            selected={form.dayOffset === 1}
            onPress={() => patch({ dayOffset: 1 })}
          />
        </View>
        <View style={styles.times}>
          <TextField
            label={t('merchant.hours.opens')}
            value={form.start}
            onChangeText={(start) => patch({ start })}
            placeholder="18:00"
          />
          <TextField
            label={t('merchant.hours.closes')}
            value={form.end}
            onChangeText={(end) => patch({ end })}
            placeholder="19:30"
          />
        </View>
        {error('window') ? <AppText variant="error">{error('window')}</AppText> : null}
      </Card>
      <Card>
        <AppText variant="subtitle">{t('merchant.baskets.allergens')}</AppText>
        <AppText variant="muted">{t('merchant.baskets.allergensHint')}</AppText>
        <View style={styles.chips}>
          {ALLERGENS.map((a) => (
            <Chip
              key={a}
              testID={`allergen-${a}`}
              label={t(`baskets.allergens.${a}`)}
              selected={form.allergens.includes(a)}
              onPress={() =>
                patch({
                  allergens: form.allergens.includes(a)
                    ? form.allergens.filter((x) => x !== a)
                    : [...form.allergens, a],
                })
              }
            />
          ))}
        </View>
        <SwitchRow
          testID="basket-allergens-confirmed"
          label={t('merchant.baskets.allergensConfirmed')}
          value={form.allergensConfirmed}
          onValueChange={(allergensConfirmed) => patch({ allergensConfirmed })}
        />
        {error('allergens') ? <AppText variant="error">{error('allergens')}</AppText> : null}
      </Card>
      <SwitchRow
        label={t('merchant.baskets.active')}
        value={form.active}
        onValueChange={(active) => patch({ active })}
      />
      {actions.save.error ? (
        <AppText variant="error">{t(errorKey(actions.save.error))}</AppText>
      ) : null}
      <Button
        testID="basket-save"
        title={t('common.save')}
        loading={actions.save.isPending}
        onPress={onSave}
      />
    </Screen>
  );
}

export default function BasketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const merchant = useCurrentMerchant();
  const baskets = useMerchantBaskets(merchant.id);
  if (id === 'new') return <BasketEditor id={null} initial={emptyBasketForm()} />;
  if (!baskets.data)
    return <QueryState error={baskets.error} onRetry={() => void baskets.refetch()} />;
  const basket = baskets.data.find((b) => b.id === id);
  if (!basket) return <QueryState />;
  return <BasketEditor key={basket.id} id={basket.id} initial={basketToForm(basket, new Date())} />;
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  times: { flexDirection: 'row', gap: spacing.md },
});
