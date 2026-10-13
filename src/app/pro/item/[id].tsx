import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Chip, QueryState, Screen, SwitchRow, TextField } from '@/components/ui';
import { useCurrentMerchant } from '@/features/merchant/hooks';
import { deleteItem, insertItem, nextPosition, updateItem } from '@/features/menu/api';
import { useMenu, useMenuMutation } from '@/features/menu/hooks';
import { photoPaths } from '@/features/photos/api';
import { PhotoField } from '@/features/photos/PhotoField';
import { OptionGroupsEditor } from '@/features/menu/OptionGroupsEditor';
import type { MenuCategory, MenuItem } from '@/features/menu/types';
import { confirmAsync } from '@/lib/confirm';
import { errorKey } from '@/lib/errors';
import { centsToInput, parsePriceToCents } from '@/lib/money';
import { spacing } from '@/theme';

function ItemForm({
  item,
  categories,
  initialCategoryId,
}: {
  item?: MenuItem;
  categories: MenuCategory[];
  initialCategoryId: string;
}) {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item ? centsToInput(item.price_cents) : '');
  const [categoryId, setCategoryId] = useState(item?.category_id ?? initialCategoryId);
  const [isAvailable, setIsAvailable] = useState(item?.is_available ?? true);
  const [isLoyaltyMenu, setIsLoyaltyMenu] = useState(item?.is_loyalty_menu ?? false);
  const [submitted, setSubmitted] = useState(false);

  const priceCents = parsePriceToCents(price);
  const nameError = submitted && !name.trim() ? t('merchant.menu.item.nameRequired') : undefined;
  const priceError =
    submitted && priceCents === null ? t('merchant.menu.item.priceInvalid') : undefined;

  const save = useMenuMutation(merchant.id, async () => {
    const values = {
      name: name.trim(),
      description: description.trim() || null,
      price_cents: priceCents!,
      category_id: categoryId,
      is_available: isAvailable,
      is_loyalty_menu: isLoyaltyMenu,
    };
    if (item) {
      // Changement de catégorie : le produit passe en fin de liste.
      const moved = item.category_id !== categoryId;
      const target = categories.find((c) => c.id === categoryId);
      await updateItem(
        item.id,
        moved ? { ...values, position: nextPosition(target?.menu_items ?? []) } : values,
      );
      return item.id;
    }
    const target = categories.find((c) => c.id === categoryId);
    return insertItem({
      ...values,
      merchant_id: merchant.id,
      position: nextPosition(target?.menu_items ?? []),
    });
  });
  const itemId = item?.id;
  const itemName = item?.name ?? '';
  const remove = useMenuMutation(merchant.id, async () => {
    if (itemId) await deleteItem(itemId);
  });
  const savePhoto = useMenuMutation(merchant.id, async (url: string | null) => {
    if (itemId) await updateItem(itemId, { image_url: url });
  });

  const onSave = () => {
    setSubmitted(true);
    if (!name.trim() || priceCents === null) return;
    save.mutate(undefined, {
      onSuccess: (id) => {
        // Nouveau produit : on reste sur sa fiche pour ajouter des options.
        if (!item) router.replace({ pathname: '/pro/item/[id]', params: { id: id as string } });
        else router.back();
      },
    });
  };

  const onDelete = async () => {
    const ok = await confirmAsync({
      title: t('common.delete'),
      message: t('merchant.menu.item.deleteConfirm', { name: itemName }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) remove.mutate(undefined, { onSuccess: () => router.back() });
  };

  const error = save.error ?? remove.error;
  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: t(item ? 'merchant.menu.item.editTitle' : 'merchant.menu.item.newTitle'),
        }}
      />
      {item ? (
        <PhotoField
          testID="item-photo"
          label={t('photos.item')}
          url={item.image_url}
          path={photoPaths.item(merchant.id, item.id)}
          onSaved={(url) => savePhoto.mutateAsync(url)}
        />
      ) : (
        <AppText variant="muted">{t('photos.itemAfterSave')}</AppText>
      )}
      <TextField
        label={t('merchant.menu.item.name')}
        value={name}
        onChangeText={setName}
        error={nameError}
      />
      <TextField
        label={t('merchant.menu.item.price')}
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        placeholder="8,50"
        error={priceError}
      />
      <TextField
        label={t('merchant.menu.item.description')}
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <AppText variant="muted">{t('merchant.menu.item.category')}</AppText>
      <View style={styles.chips}>
        {categories.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            selected={c.id === categoryId}
            onPress={() => setCategoryId(c.id)}
          />
        ))}
      </View>
      <SwitchRow
        label={t('merchant.menu.item.available')}
        value={isAvailable}
        onValueChange={setIsAvailable}
      />
      <SwitchRow
        label={t('merchant.menu.item.loyaltyMenu')}
        hint={t('merchant.menu.item.loyaltyMenuHint')}
        value={isLoyaltyMenu}
        onValueChange={setIsLoyaltyMenu}
      />
      {error ? <AppText variant="error">{t(errorKey(error))}</AppText> : null}
      <Button
        testID="item-save"
        title={t('common.save')}
        loading={save.isPending}
        onPress={onSave}
      />

      {item ? (
        <>
          <OptionGroupsEditor item={item} />
          <Button
            variant="danger"
            title={t('common.delete')}
            loading={remove.isPending}
            onPress={() => void onDelete()}
          />
        </>
      ) : (
        <AppText variant="muted">{t('merchant.menu.item.saveFirst')}</AppText>
      )}
    </Screen>
  );
}

export default function ItemScreen() {
  const { id, categoryId } = useLocalSearchParams<{ id: string; categoryId?: string }>();
  const merchant = useCurrentMerchant();
  const menu = useMenu(merchant.id);

  if (!menu.data) return <QueryState error={menu.error} onRetry={() => void menu.refetch()} />;
  const categories = menu.data;
  const item = categories.flatMap((c) => c.menu_items).find((i) => i.id === id);
  if (id !== 'new' && !item) return <QueryState />;

  return (
    <ItemForm
      key={item?.id ?? 'new'}
      item={item}
      categories={categories}
      initialCategoryId={categoryId ?? categories[0]?.id ?? ''}
    />
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
