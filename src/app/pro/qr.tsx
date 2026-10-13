import { useTranslation } from 'react-i18next';
import { Platform, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { useCurrentMerchant } from '@/features/merchant/hooks';
import { merchantPublicUrl } from '@/features/merchant/types';
import { spacing } from '@/theme';

export default function QrScreen() {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const url = merchantPublicUrl(merchant.slug);

  const share = () =>
    Share.share({ message: t('merchant.qr.shareMessage', { name: merchant.name, url }), url });

  return (
    <Screen scroll>
      <AppText variant="muted">{t('merchant.qr.body')}</AppText>
      {/* Fond blanc forcé : un QR code doit rester lisible même en mode sombre. */}
      <Card style={styles.poster}>
        <AppText variant="title" style={styles.dark}>
          {merchant.name}
        </AppText>
        <View testID="merchant-qr">
          <QRCode value={url} size={220} />
        </View>
        <AppText style={[styles.center, styles.dark]}>{t('merchant.qr.cta')}</AppText>
        <AppText variant="muted" style={styles.center} selectable>
          {url}
        </AppText>
      </Card>
      <Button title={t('common.share')} onPress={() => void share()} />
      {Platform.OS === 'web' ? (
        <Button
          variant="secondary"
          title={t('merchant.qr.print')}
          onPress={() => globalThis.print?.()}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  poster: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  dark: { color: '#111827' },
  center: { textAlign: 'center' },
});
