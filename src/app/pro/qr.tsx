import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { useCurrentMerchant } from '@/features/merchant/hooks';
import { buildPrintDocument, type PrintFormat } from '@/features/merchant/printKit';
import { merchantAppUrl, merchantPublicUrl } from '@/features/merchant/types';
import { spacing } from '@/theme';

export default function QrScreen() {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const flyerUrl = merchantPublicUrl(merchant.slug);
  const url = merchantAppUrl(merchant.slug);
  const [printError, setPrintError] = useState(false);
  const preparePrint = (format: PrintFormat) => {
    setPrintError(false);
    const vitrine = format === 'sticker';
    const svg = globalThis.document?.querySelector(
      vitrine ? '[data-testid="merchant-qr"] svg' : '[data-testid="merchant-flyer-qr"] svg',
    );
    if (!svg) {
      setPrintError(true);
      return;
    }
    const popup = globalThis.open?.('', '_blank');
    if (!popup) {
      setPrintError(true);
      return;
    }
    const qr = svg.cloneNode(true) as SVGElement;
    qr.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    popup.opener = null;
    popup.document.open();
    popup.document.write(
      buildPrintDocument({
        format,
        merchantName: merchant.name,
        url: vitrine ? url : flyerUrl,
        qrDataUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qr.outerHTML),
        copy: {
          headline: t('merchant.qr.kit.headline'),
          stickerHeadline: t('merchant.qr.kit.stickerHeadline'),
          intro: t('merchant.qr.kit.intro'),
          cta: t(vitrine ? 'merchant.qr.kit.stickerCta' : 'merchant.qr.kit.cta'),
          benefit: t('merchant.qr.kit.benefit'),
          footer: t('merchant.qr.kit.footer'),
          print: t('merchant.qr.kit.printAction'),
          hint: t('merchant.qr.kit.printHint'),
        },
      }),
    );
    popup.document.close();
    popup.document.getElementById('print')?.addEventListener('click', () => popup.print());
  };

  const share = () =>
    Share.share({ message: t('merchant.qr.shareMessage', { name: merchant.name, url }), url });

  return (
    <Screen scroll>
      <AppText variant="subtitle">{t('merchant.qr.vitrineTitle')}</AppText>
      <AppText variant="muted">{t('merchant.qr.body')}</AppText>
      {/* Fond blanc forcé : un QR code doit rester lisible même en mode sombre. */}
      <Card style={styles.poster}>
        <AppText variant="title" style={styles.dark}>
          {merchant.name}
        </AppText>
        <View testID="merchant-qr">
          <QRCode value={url} size={220} quietZone={44} ecl="M" />
        </View>
        <AppText style={[styles.center, styles.dark]}>{t('merchant.qr.cta')}</AppText>
        <AppText variant="muted" style={styles.center} selectable>
          {url}
        </AppText>
      </Card>
      <Button title={t('common.share')} onPress={() => void share()} />
      <AppText variant="subtitle">{t('merchant.qr.flyerTitle')}</AppText>
      <AppText variant="muted">{t('merchant.qr.flyerBody')}</AppText>
      <Card style={styles.poster}>
        <AppText variant="title" style={styles.dark}>
          {merchant.name}
        </AppText>
        <View testID="merchant-flyer-qr">
          <QRCode value={flyerUrl} size={220} quietZone={44} ecl="M" />
        </View>
        <AppText style={[styles.center, styles.dark]}>{t('merchant.qr.kit.cta')}</AppText>
        <AppText variant="muted" style={styles.center} selectable>
          {flyerUrl}
        </AppText>
      </Card>
      {Platform.OS === 'web' ? (
        <>
          <AppText variant="subtitle">{t('merchant.qr.kit.title')}</AppText>
          <AppText variant="muted">{t('merchant.qr.kit.body')}</AppText>
          {!merchant.is_published ? (
            <AppText variant="error">{t('merchant.qr.kit.unpublished')}</AppText>
          ) : null}
          <Button
            testID="qr-flyer"
            title={t('merchant.qr.kit.flyer')}
            onPress={() => preparePrint('flyer')}
          />
          <Button
            testID="qr-sticker"
            variant="secondary"
            title={t('merchant.qr.kit.sticker')}
            onPress={() => preparePrint('sticker')}
          />
          <Button
            testID="qr-sheet"
            variant="secondary"
            title={t('merchant.qr.kit.sheet')}
            onPress={() => preparePrint('sheet')}
          />
          {printError ? <AppText variant="error">{t('merchant.qr.kit.error')}</AppText> : null}
        </>
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
