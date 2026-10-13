import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Stars } from '@/components/ui';
import { Thumb } from '@/features/photos/Thumb';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/theme';

async function fetchOrderCourier(orderId: string) {
  const { data, error } = await supabase.rpc('order_courier_profile', { p_order_id: orderId });
  if (error) throw error;
  return data[0] ?? null;
}

/** Le livreur de la commande, comme sur une appli de VTC : photo, prénom, véhicule et note. */
export function CourierBadge({ orderId, courierName }: { orderId: string; courierName: string }) {
  const { t } = useTranslation();
  // La clé inclut le nom : si la mission change de livreur, la fiche est relue.
  const query = useQuery({
    queryKey: ['order-courier', orderId, courierName],
    queryFn: () => fetchOrderCourier(orderId),
  });
  const courier = query.data;
  const average = courier?.average == null ? null : Number(courier.average);
  return (
    <View style={styles.row} testID="courier-badge">
      <Thumb url={courier?.photo_url} size={56} round icon="person-outline" label={courierName} />
      <View style={styles.flex}>
        <AppText variant="subtitle">{courier?.display_name ?? courierName}</AppText>
        <AppText variant="muted">
          {courier
            ? `${t(`courier.onboarding.vehicles.${courier.vehicle}`)} · ${t('client.order.yourCourier')}`
            : t('client.order.yourCourier')}
        </AppText>
        {average !== null ? (
          <View style={styles.row}>
            <Stars value={average} />
            <AppText variant="muted">
              {average.toFixed(1).replace('.', ',')} ·{' '}
              {t('reviews.count', { count: courier?.reviews_count ?? 0 })}
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, gap: 2 },
});
