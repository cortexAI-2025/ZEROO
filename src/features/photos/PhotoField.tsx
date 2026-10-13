import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { errorKey } from '@/lib/errors';
import { radius, spacing, useThemeColors } from '@/theme';

import { removePhoto, uploadPhoto } from './api';
import { pickImage } from './pickImage';

type Props = {
  label: string;
  url: string | null;
  /** Emplacement du fichier dans le bucket (voir photoPaths). */
  path: string;
  /** Enregistre la nouvelle URL (ou null après suppression) dans la table. */
  onSaved: (url: string | null) => Promise<unknown>;
  shape?: 'wide' | 'square' | 'round';
  testID?: string;
};

/** Photo modifiable : aperçu, choix d'une nouvelle photo, suppression. */
export function PhotoField({ label, url, path, onSaved, shape = 'square', testID }: Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const change = async () => {
    setMessage(null);
    const picked = await pickImage();
    if (picked === 'unsupported') return setMessage(t('photos.webOnly'));
    if (!picked) return;
    setBusy(true);
    try {
      await onSaved(await uploadPhoto(path, picked));
    } catch (e) {
      setMessage(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setMessage(null);
    setBusy(true);
    try {
      await removePhoto(path);
      await onSaved(null);
    } catch (e) {
      setMessage(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const frame = [styles[shape], { backgroundColor: colors.surface, borderColor: colors.border }];
  return (
    <View style={styles.container} testID={testID}>
      <AppText variant="muted">{label}</AppText>
      <View style={styles.row}>
        {url ? (
          <Image
            source={{ uri: url }}
            style={frame}
            contentFit="cover"
            accessibilityLabel={label}
          />
        ) : (
          <View style={[frame, styles.empty]}>
            <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.actions}>
          <Button
            variant="secondary"
            title={url ? t('photos.change') : t('photos.add')}
            loading={busy}
            onPress={() => void change()}
          />
          {url ? (
            <Button
              variant="ghost"
              title={t('photos.remove')}
              disabled={busy}
              onPress={() => void remove()}
            />
          ) : null}
        </View>
      </View>
      <AppText variant="muted">{t('photos.hint')}</AppText>
      {message ? <AppText variant="muted">{message}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  actions: { flex: 1, minWidth: 160, gap: spacing.xs },
  wide: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg, borderWidth: 1 },
  square: { width: 96, height: 96, borderRadius: radius.md, borderWidth: 1 },
  round: { width: 96, height: 96, borderRadius: 48, borderWidth: 1 },
  empty: { alignItems: 'center', justifyContent: 'center' },
});
