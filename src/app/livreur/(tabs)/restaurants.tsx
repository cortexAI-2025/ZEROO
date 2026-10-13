import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, Screen, TextField } from '@/components/ui';
import { useCourierActions, useCurrentCourier, useMyLinks } from '@/features/courier/hooks';
import type { CourierLinkStatus } from '@/features/courier/types';
import { formatDistance } from '@/features/discover/location';
import { useMerchantSearch } from '@/features/discover/hooks';
import { confirmAsync } from '@/lib/confirm';
import { errorKey } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { spacing } from '@/theme';

const TONES: Record<CourierLinkStatus, 'success' | 'warning' | 'danger'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'danger',
};

/** Restaurants du livreur : demandes de rattachement et recherche de nouveaux restaurants. */
export default function CourierRestaurantsScreen() {
  const { t } = useTranslation();
  const courier = useCurrentCourier();
  const links = useMyLinks(courier.id);
  const actions = useCourierActions();
  const [query, setQuery] = useState('');
  const search = useMerchantSearch(query);
  const [error, setError] = useState<string | null>(null);
  const linked = new Set((links.data ?? []).map((l) => l.merchant_id));

  const perform = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(t(errorKey(e)));
    }
  };

  const leave = async (merchantId: string) => {
    const ok = await confirmAsync({
      title: t('courier.restaurants.leaveConfirmTitle'),
      message: t('courier.restaurants.leaveConfirmBody'),
      confirmLabel: t('courier.restaurants.leave'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) await perform(() => actions.leave.mutateAsync(merchantId));
  };

  return (
    <Screen scroll>
      <AppText variant="title">{t('courier.restaurants.title')}</AppText>
      <AppText variant="muted">{t('courier.restaurants.intro')}</AppText>

      {(links.data ?? []).length === 0 && !links.isPending ? (
        <AppText variant="muted">{t('courier.restaurants.empty')}</AppText>
      ) : null}
      {(links.data ?? []).map((link) => (
        <Card key={link.merchant_id} testID={`link-${link.merchants?.slug}`}>
          <View style={styles.header}>
            <AppText variant="subtitle" style={styles.flex}>
              {link.merchants?.name}
            </AppText>
            <Badge
              label={t(`courier.restaurants.statuses.${link.status}`)}
              tone={TONES[link.status]}
            />
          </View>
          {link.merchants ? (
            <AppText variant="muted">
              {link.merchants.city} ·{' '}
              {link.merchants.delivery_enabled
                ? t('courier.restaurants.fee', {
                    price: formatCents(link.merchants.delivery_fee_cents),
                    distance: formatDistance(link.merchants.delivery_radius_m),
                  })
                : t('courier.restaurants.noDelivery')}
            </AppText>
          ) : null}
          {link.status !== 'rejected' ? (
            <Button
              variant="ghost"
              title={t('courier.restaurants.leave')}
              onPress={() => void leave(link.merchant_id)}
            />
          ) : null}
        </Card>
      ))}

      <TextField
        label={t('courier.restaurants.search')}
        placeholder={t('courier.restaurants.searchPlaceholder')}
        value={query}
        onChangeText={setQuery}
        testID="courier-merchant-search"
      />
      {(search.data ?? [])
        .filter((m) => !linked.has(m.id))
        .map((m) => (
          <Card key={m.id}>
            <AppText variant="subtitle">{m.name}</AppText>
            <AppText variant="muted">
              {m.address_line}, {m.city}
            </AppText>
            <Button
              testID={`request-link-${m.slug}`}
              variant="secondary"
              title={t('courier.restaurants.request')}
              loading={actions.requestLink.isPending && actions.requestLink.variables === m.id}
              onPress={() => void perform(() => actions.requestLink.mutateAsync(m.id))}
            />
          </Card>
        ))}
      {error ? <AppText variant="error">{error}</AppText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
