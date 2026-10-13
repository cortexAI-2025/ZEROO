import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { AppText, Button, Card } from '@/components/ui';
import { confirmAsync } from '@/lib/confirm';
import { errorKey } from '@/lib/errors';
import { centsToInput, parsePriceToCents } from '@/lib/money';
import { radius, spacing, useThemeColors } from '@/theme';

import {
  deleteOption,
  deleteOptionGroup,
  insertOption,
  insertOptionGroup,
  nextPosition,
  updateOption,
  updateOptionGroup,
} from './api';
import { useMenuMutation } from './hooks';
import type { MenuItem, MenuOptionGroup } from './types';

/** Champ enregistré à la perte du focus : chaque modification part immédiatement en base. */
function BlurField({
  value,
  onCommit,
  label,
  keyboardType,
  style,
}: {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  keyboardType?: 'decimal-pad';
  style?: object;
}) {
  const colors = useThemeColors();
  const [draft, setDraft] = useState(value);
  return (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={colors.textMuted}
      value={draft}
      onChangeText={setDraft}
      onBlur={() => {
        if (draft.trim() && draft !== value) onCommit(draft.trim());
        else setDraft(value);
      }}
      keyboardType={keyboardType}
      style={[
        styles.input,
        { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
        style,
      ]}
    />
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.stepper}>
      <AppText variant="muted">{label}</AppText>
      <Pressable
        accessibilityLabel={`${label} -`}
        disabled={value <= min}
        onPress={() => onChange(value - 1)}
        hitSlop={8}>
        <Ionicons
          name="remove-circle-outline"
          size={26}
          color={value <= min ? colors.border : colors.text}
        />
      </Pressable>
      <AppText>{value}</AppText>
      <Pressable
        accessibilityLabel={`${label} +`}
        disabled={value >= max}
        onPress={() => onChange(value + 1)}
        hitSlop={8}>
        <Ionicons
          name="add-circle-outline"
          size={26}
          color={value >= max ? colors.border : colors.text}
        />
      </Pressable>
    </View>
  );
}

function GroupEditor({ group, merchantId }: { group: MenuOptionGroup; merchantId: string }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const mutate = useMenuMutation(merchantId, (fn: () => Promise<void>) => fn());
  const optionCount = Math.max(group.menu_options.length, 1);

  const onDeleteGroup = async () => {
    const ok = await confirmAsync({
      title: t('common.delete'),
      message: t('merchant.menu.item.deleteGroupConfirm', { name: group.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) mutate.mutate(() => deleteOptionGroup(group.id));
  };

  return (
    <Card>
      <View style={styles.row}>
        <BlurField
          label={t('merchant.menu.item.groupName')}
          value={group.name}
          onCommit={(name) => mutate.mutate(() => updateOptionGroup(group.id, { name }))}
          style={styles.flex}
        />
        <Pressable
          accessibilityLabel={t('common.delete')}
          onPress={() => void onDeleteGroup()}
          hitSlop={8}>
          <Ionicons name="trash-outline" size={22} color={colors.danger} />
        </Pressable>
      </View>
      <View style={styles.row}>
        <Stepper
          label={t('merchant.menu.item.minSelect')}
          value={group.min_select}
          min={0}
          max={group.max_select}
          onChange={(v) => mutate.mutate(() => updateOptionGroup(group.id, { min_select: v }))}
        />
        <Stepper
          label={t('merchant.menu.item.maxSelect')}
          value={group.max_select}
          min={Math.max(1, group.min_select)}
          max={Math.max(optionCount, group.max_select)}
          onChange={(v) => mutate.mutate(() => updateOptionGroup(group.id, { max_select: v }))}
        />
      </View>

      {group.menu_options.map((option) => (
        <View key={option.id} style={styles.row}>
          <BlurField
            label={t('merchant.menu.item.optionName')}
            value={option.name}
            onCommit={(name) => mutate.mutate(() => updateOption(option.id, { name }))}
            style={styles.flex}
          />
          <BlurField
            label={t('merchant.menu.item.optionPrice')}
            value={centsToInput(option.price_delta_cents)}
            keyboardType="decimal-pad"
            onCommit={(v) => {
              const cents = parsePriceToCents(v);
              if (cents !== null)
                mutate.mutate(() => updateOption(option.id, { price_delta_cents: cents }));
            }}
            style={styles.price}
          />
          <Switch
            accessibilityLabel={`${t('merchant.menu.item.available')} : ${option.name}`}
            value={option.is_available}
            onValueChange={(v) => mutate.mutate(() => updateOption(option.id, { is_available: v }))}
            trackColor={{ true: colors.brand, false: colors.border }}
          />
          <Pressable
            accessibilityLabel={t('common.delete')}
            onPress={() => mutate.mutate(() => deleteOption(option.id))}
            hitSlop={8}>
            <Ionicons name="close-circle-outline" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      ))}
      <Button
        variant="ghost"
        title={`+ ${t('merchant.menu.item.addOption')}`}
        onPress={() =>
          mutate.mutate(() =>
            insertOption({
              merchant_id: merchantId,
              group_id: group.id,
              name: t('merchant.menu.item.newOptionDefault'),
              position: nextPosition(group.menu_options),
            }),
          )
        }
      />
      {mutate.error ? <AppText variant="error">{t(errorKey(mutate.error))}</AppText> : null}
    </Card>
  );
}

export function OptionGroupsEditor({ item }: { item: MenuItem }) {
  const { t } = useTranslation();
  const addGroup = useMenuMutation(item.merchant_id, () =>
    insertOptionGroup({
      merchant_id: item.merchant_id,
      item_id: item.id,
      name: t('merchant.menu.item.newGroupDefault'),
      min_select: 1,
      max_select: 1,
      position: nextPosition(item.menu_option_groups),
    }),
  );

  return (
    <View style={styles.section}>
      <AppText variant="subtitle">{t('merchant.menu.item.options')}</AppText>
      <AppText variant="muted">{t('merchant.menu.item.optionsHint')}</AppText>
      {item.menu_option_groups.map((group) => (
        <GroupEditor key={group.id} group={group} merchantId={item.merchant_id} />
      ))}
      <Button
        variant="secondary"
        title={`+ ${t('merchant.menu.item.addGroup')}`}
        loading={addGroup.isPending}
        onPress={() => addGroup.mutate(undefined)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 15,
  },
  price: { width: 90 },
});
