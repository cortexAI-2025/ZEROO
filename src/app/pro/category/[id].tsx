import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText, Button, QueryState, Screen, SwitchRow, TextField } from '@/components/ui';
import { useCurrentMerchant } from '@/features/merchant/hooks';
import { deleteCategory, updateCategory } from '@/features/menu/api';
import { useMenu, useMenuMutation } from '@/features/menu/hooks';
import type { MenuCategory } from '@/features/menu/types';
import { confirmAsync } from '@/lib/confirm';
import { errorKey } from '@/lib/errors';

function CategoryForm({ category }: { category: MenuCategory }) {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const [name, setName] = useState(category.name);
  const [isActive, setIsActive] = useState(category.is_active);

  const save = useMenuMutation(merchant.id, () =>
    updateCategory(category.id, { name: name.trim(), is_active: isActive }),
  );
  const remove = useMenuMutation(merchant.id, () => deleteCategory(category.id));

  const onDelete = async () => {
    const ok = await confirmAsync({
      title: t('common.delete'),
      message: t('merchant.menu.deleteCategoryConfirm', { name: category.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) remove.mutate(undefined, { onSuccess: () => router.back() });
  };

  const error = save.error ?? remove.error;
  return (
    <Screen scroll>
      <TextField label={t('merchant.menu.categoryName')} value={name} onChangeText={setName} />
      <SwitchRow
        label={t('merchant.menu.categoryActive')}
        value={isActive}
        onValueChange={setIsActive}
      />
      {error ? <AppText variant="error">{t(errorKey(error))}</AppText> : null}
      <Button
        title={t('common.save')}
        disabled={!name.trim()}
        loading={save.isPending}
        onPress={() => save.mutate(undefined, { onSuccess: () => router.back() })}
      />
      <Button
        variant="danger"
        title={t('common.delete')}
        loading={remove.isPending}
        onPress={() => void onDelete()}
      />
    </Screen>
  );
}

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const merchant = useCurrentMerchant();
  const menu = useMenu(merchant.id);
  const category = menu.data?.find((c) => c.id === id);
  if (!category) return <QueryState error={menu.error} onRetry={() => void menu.refetch()} />;
  return <CategoryForm category={category} />;
}
