import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, TextField } from '@/components/ui';
import { CartBar } from '@/features/cart/CartBar';
import { useMerchantSearch, useNearbyMerchants } from '@/features/discover/hooks';
import { type Coordinates, getCurrentCoordinates } from '@/features/discover/location';
import { MerchantCard } from '@/features/discover/MerchantCard';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme';

export default function ExploreScreen() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [locationState, setLocationState] = useState<'idle' | 'locating' | 'denied' | 'failed'>(
    'idle',
  );

  const searching = query.trim().length >= 2;
  const search = useMerchantSearch(query);
  const nearby = useNearbyMerchants(searching ? null : coords);
  const active = searching ? search : nearby;

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
      setLocationState('idle');
    } catch {
      setLocationState('failed');
    }
  };

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
        {!coords && !searching ? (
          <View style={styles.locate}>
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
          </View>
        ) : null}

        {searching || coords ? (
          <>
            <AppText variant="subtitle">
              {searching ? t('client.explore.resultsTitle') : t('client.explore.nearbyTitle')}
            </AppText>
            {active.isPending ? <ActivityIndicator /> : null}
            {active.error ? <AppText variant="error">{t(errorKey(active.error))}</AppText> : null}
            {active.data?.length === 0 ? (
              <AppText variant="muted">
                {searching ? t('client.explore.noResults') : t('client.explore.noNearby')}
              </AppText>
            ) : null}
            {active.data?.map((merchant) => (
              <MerchantCard key={merchant.id} merchant={merchant} />
            ))}
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
});
