import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import type { MenuItem, MenuOptionGroup } from '@/features/menu/types';
import { confirmAsync } from '@/lib/confirm';
import { formatCents } from '@/lib/money';
import { radius, spacing, useThemeColors } from '@/theme';

import {
  chosenOptions,
  selectionIssues,
  type Selection,
  toggleOption,
  unitPriceCents,
} from './pricing';
import { type CartMerchant, useCart } from './store';

function groupRule(group: MenuOptionGroup, t: TFunction) {
  if (group.max_select === 1) return t('client.item.chooseOne');
  if (group.min_select === 0) return t('client.item.chooseUpTo', { count: group.max_select });
  return t('client.item.chooseBetween', { min: group.min_select, max: group.max_select });
}

type Props = { item: MenuItem; merchant: CartMerchant; onClose: () => void };

/** Choix des options et de la quantité, puis ajout au panier. */
export function ItemSheet({ item, merchant, onClose }: Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const add = useCart((s) => s.add);
  const [selection, setSelection] = useState<Selection>({});
  const [quantity, setQuantity] = useState(1);
  const [showIssues, setShowIssues] = useState(false);

  const issues = selectionIssues(item, selection);
  const unit = unitPriceCents(item, selection);
  const firstMissing = item.menu_option_groups.find((g) => g.id === issues[0]?.groupId);

  const onAdd = async () => {
    if (issues.length > 0) {
      setShowIssues(true);
      return;
    }
    const line = {
      isLoyaltyMenu: item.is_loyalty_menu,
      basePriceCents: item.price_cents,
      itemId: item.id,
      name: item.name,
      unitPriceCents: unit,
      quantity,
      options: chosenOptions(item, selection),
    };
    if (!add(merchant, line)) {
      const current = useCart.getState().merchant;
      const replace = await confirmAsync({
        title: t('client.cart.replaceTitle'),
        message: t('client.cart.replaceBody', { name: current?.name ?? '' }),
        confirmLabel: t('client.cart.replaceAction'),
        cancelLabel: t('common.cancel'),
      });
      if (!replace) return;
      add(merchant, line, { replace: true });
    }
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <AppText variant="title">{item.name}</AppText>
          {item.description ? <AppText variant="muted">{item.description}</AppText> : null}
          <AppText variant="subtitle">{formatCents(item.price_cents)}</AppText>

          {item.menu_option_groups.map((group) => {
            const missing = showIssues && issues.some((i) => i.groupId === group.id);
            return (
              <View key={group.id} style={styles.group}>
                <View style={styles.row}>
                  <AppText variant="subtitle" style={styles.flex}>
                    {group.name}
                  </AppText>
                  <AppText variant={missing ? 'error' : 'muted'}>
                    {groupRule(group, t)}
                    {group.min_select > 0 ? ` · ${t('client.item.required')}` : ''}
                  </AppText>
                </View>
                {group.menu_options.map((option) => {
                  const selected = selection[group.id]?.includes(option.id) ?? false;
                  const icon =
                    group.max_select === 1
                      ? selected
                        ? 'radio-button-on'
                        : 'radio-button-off'
                      : selected
                        ? 'checkbox'
                        : 'square-outline';
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole={group.max_select === 1 ? 'radio' : 'checkbox'}
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={option.name}
                      onPress={() =>
                        setSelection((s) => toggleOption(item, s, group.id, option.id))
                      }
                      style={[styles.row, styles.option, { borderColor: colors.border }]}>
                      <Ionicons
                        name={icon}
                        size={22}
                        color={selected ? colors.brand : colors.textMuted}
                      />
                      <AppText style={styles.flex}>{option.name}</AppText>
                      {option.price_delta_cents > 0 ? (
                        <AppText variant="muted">+ {formatCents(option.price_delta_cents)}</AppText>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            );
          })}

          <View style={[styles.row, styles.quantity]}>
            <AppText style={styles.flex}>{t('client.item.quantity')}</AppText>
            <Pressable
              accessibilityLabel={`${t('client.item.quantity')} -`}
              disabled={quantity <= 1}
              onPress={() => setQuantity((q) => q - 1)}
              hitSlop={8}>
              <Ionicons
                name="remove-circle-outline"
                size={30}
                color={quantity <= 1 ? colors.border : colors.text}
              />
            </Pressable>
            <AppText variant="subtitle">{quantity}</AppText>
            <Pressable
              accessibilityLabel={`${t('client.item.quantity')} +`}
              disabled={quantity >= 50}
              onPress={() => setQuantity((q) => q + 1)}
              hitSlop={8}>
              <Ionicons name="add-circle-outline" size={30} color={colors.text} />
            </Pressable>
          </View>
        </ScrollView>
        <View style={styles.footer}>
          {showIssues && firstMissing ? (
            <AppText variant="error">
              {t('client.item.missing', { group: firstMissing.name })}
            </AppText>
          ) : null}
          <Button
            testID="item-add"
            title={t('client.item.add', { price: formatCents(unit * quantity) })}
            onPress={() => void onAdd()}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  content: { padding: spacing.lg, gap: spacing.md },
  group: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  option: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  quantity: { paddingTop: spacing.sm },
  flex: { flex: 1 },
  footer: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
});
