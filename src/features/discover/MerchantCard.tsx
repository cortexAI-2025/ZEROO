import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Badge, Card, Stars } from '@/components/ui';
import type { MerchantCategory } from '@/features/merchant/types';
import type { MerchantRating } from '@/features/reviews/api';
import { radius, spacing, useThemeColors } from '@/theme';

import type { MerchantSummary } from './api';
import { formatDistance } from './location';

type Props = {
  merchant: MerchantSummary;
  rating?: MerchantRating;
  photoUrl?: string;
  /** Favori du client connecté ; absent : pas de bouton favori (visiteur). */
  favorite?: boolean;
  onToggleFavorite?: () => void;
};

export function MerchantCard({ merchant, rating, photoUrl, favorite, onToggleFavorite }: Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const status = merchant.is_accepting_orders ? 'open' : merchant.is_open ? 'paused' : 'closed';
  return (
    <Pressable
      accessibilityRole="button"
      testID={`merchant-${merchant.slug}`}
      onPress={() => router.push({ pathname: '/m/[slug]', params: { slug: merchant.slug } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      <Card>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.cover}
            contentFit="cover"
            accessibilityLabel={merchant.name}
          />
        ) : null}
        <View style={styles.row}>
          <AppText variant="subtitle" style={styles.flex}>
            {merchant.name}
          </AppText>
          <Badge
            label={t(`merchant.status.${status}`)}
            tone={status === 'open' ? 'success' : status === 'paused' ? 'warning' : 'neutral'}
          />
          {onToggleFavorite ? (
            <Pressable
              testID={`favorite-${merchant.slug}`}
              accessibilityRole="button"
              accessibilityState={{ selected: !!favorite }}
              accessibilityLabel={
                favorite
                  ? t('client.favorites.remove', { name: merchant.name })
                  : t('client.favorites.add', { name: merchant.name })
              }
              hitSlop={8}
              onPress={onToggleFavorite}>
              <Ionicons
                name={favorite ? 'heart' : 'heart-outline'}
                size={24}
                color={favorite ? colors.danger : colors.textMuted}
              />
            </Pressable>
          ) : null}
        </View>
        <AppText variant="muted">
          {t(`merchant.categories.${merchant.category as MerchantCategory}`)} ·{' '}
          {merchant.address_line ? `${merchant.address_line}, ` : ''}
          {merchant.city}
          {merchant.distance_m !== null ? ` · ${formatDistance(merchant.distance_m)}` : ''}
        </AppText>
        {rating ? (
          <View style={styles.row}>
            <Stars value={rating.average} />
            <AppText variant="muted">
              {rating.average.toFixed(1).replace('.', ',')} ·{' '}
              {t('reviews.count', { count: rating.count })}
            </AppText>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  cover: { width: '100%', aspectRatio: 21 / 9, borderRadius: radius.md },
});
