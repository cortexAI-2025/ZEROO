import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText, Badge, Button, Card, QueryState, Screen, TextField } from '@/components/ui';
import { useCurrentMerchant } from '@/features/merchant/hooks';
import { insertCategory, nextPosition, swapPositions, updateItem } from '@/features/menu/api';
import { useMenu, useMenuMutation } from '@/features/menu/hooks';
import type { MenuCategory, MenuItem } from '@/features/menu/types';
import { formatCents } from '@/lib/money';
import { spacing, useThemeColors } from '@/theme';

function MoveButtons({ onUp, onDown }: { onUp?: () => void; onDown?: () => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <View style={styles.moves}>
      {[
        { icon: 'chevron-up' as const, label: t('merchant.menu.moveUp'), onPress: onUp },
        { icon: 'chevron-down' as const, label: t('merchant.menu.moveDown'), onPress: onDown },
      ].map(({ icon, label, onPress }) => (
        <Pressable
          key={icon}
          accessibilityLabel={label}
          disabled={!onPress}
          onPress={onPress}
          hitSlop={8}>
          <Ionicons name={icon} size={22} color={onPress ? colors.text : colors.border} />
        </Pressable>
      ))}
    </View>
  );
}

export default function MenuScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const merchant = useCurrentMerchant();
  const menu = useMenu(merchant.id);
  const [newCategory, setNewCategory] = useState('');

  const addCategory = useMenuMutation(merchant.id, (name: string) =>
    insertCategory({ merchant_id: merchant.id, name, position: nextPosition(menu.data ?? []) }),
  );
  const toggleItem = useMenuMutation(merchant.id, (item: MenuItem) =>
    updateItem(item.id, { is_available: !item.is_available }),
  );
  const move = useMenuMutation(
    merchant.id,
    ({
      table,
      a,
      b,
    }: {
      table: 'menu_categories' | 'menu_items';
      a: MenuItem | MenuCategory;
      b: MenuItem | MenuCategory;
    }) => swapPositions(table, a, b),
  );

  if (!menu.data) return <QueryState error={menu.error} onRetry={() => void menu.refetch()} />;
  const categories = menu.data;

  return (
    <Screen scroll>
      <AppText variant="title">{t('merchant.menu.title')}</AppText>
      {categories.length === 0 ? (
        <AppText variant="muted">{t('merchant.menu.empty')}</AppText>
      ) : null}

      {categories.map((category, ci) => (
        <Card key={category.id} testID={`category-${category.name}`}>
          <View style={styles.row}>
            <MoveButtons
              onUp={
                ci > 0
                  ? () =>
                      move.mutate({ table: 'menu_categories', a: category, b: categories[ci - 1] })
                  : undefined
              }
              onDown={
                ci < categories.length - 1
                  ? () =>
                      move.mutate({ table: 'menu_categories', a: category, b: categories[ci + 1] })
                  : undefined
              }
            />
            <Pressable
              style={styles.flex}
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/pro/category/[id]', params: { id: category.id } })
              }>
              <AppText variant="subtitle">{category.name}</AppText>
            </Pressable>
            {!category.is_active ? <Badge label={t('merchant.menu.categoryHidden')} /> : null}
          </View>

          {category.menu_items.length === 0 ? (
            <AppText variant="muted">{t('merchant.menu.emptyCategory')}</AppText>
          ) : null}
          {category.menu_items.map((item, ii) => (
            <View key={item.id} style={[styles.row, styles.item, { borderColor: colors.border }]}>
              <MoveButtons
                onUp={
                  ii > 0
                    ? () =>
                        move.mutate({
                          table: 'menu_items',
                          a: item,
                          b: category.menu_items[ii - 1],
                        })
                    : undefined
                }
                onDown={
                  ii < category.menu_items.length - 1
                    ? () =>
                        move.mutate({
                          table: 'menu_items',
                          a: item,
                          b: category.menu_items[ii + 1],
                        })
                    : undefined
                }
              />
              <Pressable
                style={styles.flex}
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/pro/item/[id]', params: { id: item.id } })
                }>
                <AppText style={!item.is_available && { color: colors.textMuted }}>
                  {item.name}
                </AppText>
                <AppText variant="muted">
                  {formatCents(item.price_cents)}
                  {item.is_available ? '' : ` · ${t('merchant.menu.unavailable')}`}
                </AppText>
              </Pressable>
              <Switch
                accessibilityLabel={`${t('merchant.menu.item.available')} : ${item.name}`}
                value={item.is_available}
                onValueChange={() => toggleItem.mutate(item)}
                trackColor={{ true: colors.brand, false: colors.border }}
              />
            </View>
          ))}
          <Button
            variant="ghost"
            title={`+ ${t('merchant.menu.addItem')}`}
            onPress={() =>
              router.push({
                pathname: '/pro/item/[id]',
                params: { id: 'new', categoryId: category.id },
              })
            }
          />
        </Card>
      ))}

      <Card>
        <TextField
          label={t('merchant.menu.newCategory')}
          placeholder={t('merchant.menu.categoryName')}
          value={newCategory}
          onChangeText={setNewCategory}
        />
        <Button
          variant="secondary"
          title={t('common.add')}
          disabled={!newCategory.trim()}
          loading={addCategory.isPending}
          onPress={() =>
            addCategory.mutate(newCategory.trim(), { onSuccess: () => setNewCategory('') })
          }
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
  moves: { gap: 2 },
});
