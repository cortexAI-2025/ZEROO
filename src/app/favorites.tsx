import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppText, QueryState, Screen } from '@/components/ui';
import { useFavoriteMerchants, useToggleFavorite } from '@/features/account/hooks';
import { useMerchantPhotos } from '@/features/discover/hooks';
import { MerchantCard } from '@/features/discover/MerchantCard';
import { useMerchantRatings } from '@/features/reviews/hooks';

/** Restaurants favoris du client : un appui sur le cœur les retire. */
export default function FavoritesScreen() {
  const { t } = useTranslation();
  const favorites = useFavoriteMerchants();
  const toggle = useToggleFavorite();
  const ids = (favorites.data ?? []).map((m) => m.id);
  const ratings = useMerchantRatings(ids);
  const photos = useMerchantPhotos(ids);

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('client.favorites.title') }} />
      {!favorites.data ? (
        <QueryState error={favorites.error} onRetry={() => void favorites.refetch()} />
      ) : favorites.data.length === 0 ? (
        <AppText variant="muted">{t('client.favorites.empty')}</AppText>
      ) : (
        favorites.data.map((merchant) => (
          <MerchantCard
            key={merchant.id}
            merchant={merchant}
            rating={ratings.data?.get(merchant.id)}
            photoUrl={photos.data?.get(merchant.id)}
            favorite
            onToggleFavorite={() => toggle.mutate({ merchantId: merchant.id, favorite: false })}
          />
        ))
      )}
    </Screen>
  );
}
