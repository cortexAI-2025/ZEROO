import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip } from '@/components/ui';
import { getCurrentCoordinates } from '@/features/discover/location';
import { formatTime } from '@/lib/dates';
import { errorKey } from '@/lib/errors';
import { callFunction } from '@/lib/functions';
import { spacing } from '@/theme';

type Mode = 'walk' | 'bike' | 'drive';
const MODES: Mode[] = ['walk', 'bike', 'drive'];

type Props = { orderId: string; etaAt: string | null; onAnnounced: () => void };

/**
 * « Je pars maintenant » : la position est lue une seule fois, envoyée au serveur qui
 * calcule le trajet, puis oubliée. Seule l'heure d'arrivée est transmise au commerçant.
 */
export function DepartureCard({ orderId, etaAt, onAnnounced }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('walk');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const announce = async () => {
    setError(null);
    setBusy(true);
    try {
      const position = await getCurrentCoordinates();
      if (position === 'denied') {
        setError(t('client.departure.locationDenied'));
        return;
      }
      await callFunction('customer-departure', { orderId, ...position, mode });
      onAnnounced();
    } catch (e) {
      const key = errorKey(e);
      setError(key === 'common.genericError' ? t('client.departure.failed') : t(key));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card testID="departure-card">
      <AppText variant="subtitle">{t('client.departure.title')}</AppText>
      {etaAt ? (
        <AppText testID="departure-announced">
          {t('client.departure.announced', { time: formatTime(etaAt) })}
        </AppText>
      ) : (
        <AppText variant="muted">{t('client.departure.body')}</AppText>
      )}
      <View style={styles.chips}>
        {MODES.map((m) => (
          <Chip
            key={m}
            label={t(`client.departure.modes.${m}`)}
            selected={mode === m}
            onPress={() => setMode(m)}
          />
        ))}
      </View>
      <Button
        testID="departure-go"
        variant={etaAt ? 'secondary' : 'primary'}
        title={etaAt ? t('client.departure.update') : t('client.departure.go')}
        loading={busy}
        onPress={() => void announce()}
      />
      <AppText variant="muted">{t('client.departure.privacy')}</AppText>
      {error ? <AppText variant="error">{error}</AppText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
