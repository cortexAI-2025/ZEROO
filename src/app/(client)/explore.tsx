import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Button, Chip, Screen, TextField } from '@/components/ui';
import { useFavoriteIds, useFavoriteMerchants, useToggleFavorite } from '@/features/account/hooks';
import { useAuth } from '@/features/auth/AuthProvider';
import { CartBar } from '@/features/cart/CartBar';
import type { MerchantSummary } from '@/features/discover/api';
import { DirectoryMap, MAP_SUPPORTED } from '@/features/discover/DirectoryMap';
import {
  activeFilterCount,
  applyFilters,
  type DirectoryFilters,
  mappable,
  NO_FILTERS,
} from '@/features/discover/filters';
import {
  useMerchantPhotos,
  useMerchantSearch,
  useNearbyMerchants,
} from '@/features/discover/hooks';
import { type Coordinates, getCurrentCoordinates } from '@/features/discover/location';
import { MerchantCard } from '@/features/discover/MerchantCard';
import { MEAL_PERIODS } from '@/features/menu/slots';
import { AddressField, type AddressValue } from '@/features/merchant/AddressField';
import { MERCHANT_CATEGORIES } from '@/features/merchant/types';
import { useMerchantRatings } from '@/features/reviews/hooks';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme';

export default function ExploreScreen() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [address, setAddress] = useState<AddressValue | undefined>(undefined);
  const [filters, setFilters] = useState<DirectoryFilters>(NO_FILTERS);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [locationState, setLocationState] = useState<'idle' | 'locating' | 'denied' | 'failed'>(
    'idle',
  );

  const searching = query.trim().length >= 2;
  const search = useMerchantSearch(query);
  const nearby = useNearbyMerchants(searching ? null : coords);
  const active = searching ? search : nearby;
  const results = applyFilters(active.data ?? [], filters);
  const patch = (changes: Partial<DirectoryFilters>) => setFilters((f) => ({ ...f, ...changes }));

  // Favoris et notes : seulement pour un client connecté (les notes sont publiques).
  const signedIn = !!useAuth().session;
  const favoriteIds = useFavoriteIds();
  const favorites = useFavoriteMerchants();
  const toggleFavorite = useToggleFavorite();
  const listed = [...(favorites.data ?? []), ...results];
  const listedIds = [...new Set(listed.map((m) => m.id))];
  const ratings = useMerchantRatings(listedIds);
  const photos = useMerchantPhotos(listedIds);
  const card = (merchant: MerchantSummary) => {
    const favorite = favoriteIds.data?.has(merchant.id) ?? false;
    return (
      <MerchantCard
        key={merchant.id}
        merchant={merchant}
        rating={ratings.data?.get(merchant.id)}
        photoUrl={photos.data?.get(merchant.id)}
        favorite={favorite}
        onToggleFavorite={
          signedIn
            ? () => toggleFavorite.mutate({ merchantId: merchant.id, favorite: !favorite })
            : undefined
        }
      />
    );
  };

  // La position n'est demandée qu'après ce clic (consentement explicite, RGPD).
  const locate = async () => {
    setLocationState('locating');
    try {
      const result = await getCurrentCoordinates();
      if (result === 'denied') {
        setLocationState('denied');
        return;
      }
      setCoords(result);
      setAddress(undefined);
      setLocationState('idle');
    } catch {
      setLocationState('failed');
    }
  };

  // Recherche autour d'une adresse choisie dans la liste (sans géolocalisation).
  const pickAddress = (value: AddressValue) => {
    setAddress(value);
    setCoords({ latitude: value.latitude, longitude: value.longitude });
    setLocationState('idle');
  };

  const selected = results.find((m) => m.slug === selectedSlug);
  const showFilters = searching || !!coords;

  return (
    <View style={styles.flex}>
      <Screen scroll>
        <AppText variant="title">{t('client.explore.title')}</AppText>
        <TextField
          label={t('client.explore.searchLabel')}
          placeholder={t('client.explore.searchPlaceholder')}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
        {!searching && (favorites.data ?? []).length > 0 ? (
          <>
            <AppText variant="subtitle">{t('client.favorites.title')}</AppText>
            {favorites.data?.map(card)}
          </>
        ) : null}

        {!searching ? (
          <View style={styles.locate}>
            {!coords ? (
              <>
                <Button
                  variant="secondary"
                  title={t('client.explore.useLocation')}
                  loading={locationState === 'locating'}
                  onPress={() => void locate()}
                />
                <AppText variant="muted">{t('client.explore.locationHint')}</AppText>
                {locationState === 'denied' ? (
                  <AppText variant="error">{t('client.explore.locationDenied')}</AppText>
                ) : null}
                {locationState === 'failed' ? (
                  <AppText variant="error">{t('client.explore.locationFailed')}</AppText>
                ) : null}
              </>
            ) : null}
            <AddressField
              testID="explore-address"
              label={t('client.explore.addressLabel')}
              hint={t('client.explore.addressHint')}
              value={address}
              onChange={pickAddress}
            />
          </View>
        ) : null}

        {showFilters ? (
          <>
            <View style={styles.chips}>
              <Chip
                testID="filter-all"
                label={t('client.explore.filters.all')}
                selected={filters.category === null}
                onPress={() => patch({ category: null })}
              />
              {MERCHANT_CATEGORIES.filter((c) => c !== 'autre').map((c) => (
                <Chip
                  key={c}
                  testID={`filter-category-${c}`}
                  label={t(`merchant.categories.${c}`)}
                  selected={filters.category === c}
                  onPress={() => patch({ category: filters.category === c ? null : c })}
                />
              ))}
            </View>
            <View style={styles.chips}>
              <Chip
                testID="filter-open"
                label={t('client.explore.filters.openNow')}
                selected={filters.openNow}
                onPress={() => patch({ openNow: !filters.openNow })}
              />
              <Chip
                testID="filter-pickup"
                label={t('client.explore.filters.pickup')}
                selected={filters.pickup}
                onPress={() => patch({ pickup: !filters.pickup })}
              />
              <Chip
                testID="filter-delivery"
                label={t('client.explore.filters.delivery')}
                selected={filters.delivery}
                onPress={() => patch({ delivery: !filters.delivery })}
              />
              <Chip
                testID="filter-happy"
                label={t('client.explore.filters.happyHour')}
                selected={filters.happyHour}
                onPress={() => patch({ happyHour: !filters.happyHour })}
              />
            </View>
            <View style={styles.chips}>
              {MEAL_PERIODS.map((p) => (
                <Chip
                  key={p}
                  testID={`filter-period-${p}`}
                  label={t(`merchant.menu.periods.${p}`)}
                  selected={filters.mealPeriod === p}
                  onPress={() => patch({ mealPeriod: filters.mealPeriod === p ? null : p })}
                />
              ))}
            </View>
            {MAP_SUPPORTED ? (
              <View style={styles.chips}>
                <Chip
                  testID="view-list"
                  label={t('client.explore.viewList')}
                  selected={view === 'list'}
                  onPress={() => setView('list')}
                />
                <Chip
                  testID="view-map"
                  label={t('client.explore.viewMap')}
                  selected={view === 'map'}
                  onPress={() => setView('map')}
                />
              </View>
            ) : null}

            <AppText variant="subtitle">
              {searching
                ? t('client.explore.resultsTitle')
                : address
                  ? t('client.explore.aroundAddress', {
                      address: `${address.addressLine}, ${address.city}`,
                    })
                  : t('client.explore.nearbyTitle')}
            </AppText>
            {active.isPending && (searching || coords) ? <ActivityIndicator /> : null}
            {active.error ? <AppText variant="error">{t(errorKey(active.error))}</AppText> : null}
            {active.data ? (
              <AppText variant="muted" testID="explore-count">
                {t('client.explore.count', { count: results.length })}
              </AppText>
            ) : null}
            {active.data?.length === 0 ? (
              <AppText variant="muted">
                {searching ? t('client.explore.noResults') : t('client.explore.noNearby')}
              </AppText>
            ) : null}
            {active.data && active.data.length > 0 && results.length === 0 ? (
              <>
                <AppText variant="muted">{t('client.explore.noMatch')}</AppText>
                <Button
                  variant="ghost"
                  title={t('client.explore.clearFilters')}
                  onPress={() => setFilters(NO_FILTERS)}
                />
              </>
            ) : null}
            {activeFilterCount(filters) > 0 && results.length > 0 ? (
              <Button
                variant="ghost"
                title={t('client.explore.clearFilters')}
                onPress={() => setFilters(NO_FILTERS)}
              />
            ) : null}

            {view === 'map' && MAP_SUPPORTED ? (
              <>
                <DirectoryMap
                  merchants={mappable(results)}
                  center={coords}
                  selectedSlug={selectedSlug}
                  onSelect={setSelectedSlug}
                />
                <AppText variant="muted">{t('client.explore.mapNote')}</AppText>
                {selected ? card(selected) : null}
              </>
            ) : (
              results.map(card)
            )}
          </>
        ) : null}
      </Screen>
      <CartBar showMerchant />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  locate: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
