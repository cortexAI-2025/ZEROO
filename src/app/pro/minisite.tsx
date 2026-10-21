import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip, Screen, TextField } from '@/components/ui';
import { useCurrentMerchant, useUpdateMerchant } from '@/features/merchant/hooks';
import { ACCENT_COLORS, ACCENT_NAMES } from '@/features/merchant/minisite';
import { merchantPublicUrl } from '@/features/merchant/types';
import { photoPaths } from '@/features/photos/api';
import { PhotoField } from '@/features/photos/PhotoField';
import { errorKey } from '@/lib/errors';
import { radius, spacing } from '@/theme';

/**
 * Mini-site du commerçant (formule Pro) : logo, accroche, présentation, couleur. Le reste (photo,
 * horaires, menu, Happy Hours, modes de commande) vient des écrans déjà remplis : aucune double
 * saisie. Sans Pro, la fiche de commande reste en ligne, les réglages sont conservés.
 */
export default function MiniSiteScreen() {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const update = useUpdateMerchant(merchant.id);
  const pro = !!merchant.has_minisite;
  const [tagline, setTagline] = useState(merchant.tagline ?? '');
  const [about, setAbout] = useState(merchant.about ?? '');
  const dirty =
    tagline.trim() !== (merchant.tagline ?? '') || about.trim() !== (merchant.about ?? '');

  return (
    <Screen scroll>
      <AppText variant="muted">{t('merchant.minisite.hint')}</AppText>
      <Card testID="minisite-link">
        <AppText variant="subtitle">{t('merchant.minisite.linkTitle')}</AppText>
        <AppText selectable>{merchantPublicUrl(merchant.slug)}</AppText>
        <View style={styles.actions}>
          <Button
            variant="secondary"
            title={t('merchant.minisite.preview')}
            onPress={() => router.push({ pathname: '/m/[slug]', params: { slug: merchant.slug } })}
          />
          <Button
            variant="secondary"
            title={t('merchant.shop.qr')}
            onPress={() => router.push('/pro/qr')}
          />
        </View>
      </Card>

      {!pro ? (
        <Card testID="minisite-requires-pro">
          <AppText variant="subtitle">{t('merchant.minisite.proTitle')}</AppText>
          <AppText variant="muted">{t('merchant.minisite.proBody')}</AppText>
          <Button
            variant="secondary"
            title={t('merchant.minisite.proAction')}
            onPress={() => router.push('/pro/account')}
          />
          {merchant.tagline || merchant.about || merchant.logo_url || merchant.accent_color ? (
            <AppText variant="muted" testID="minisite-kept">
              {t('merchant.minisite.kept')}
            </AppText>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <PhotoField
          testID="minisite-cover"
          label={t('merchant.minisite.cover')}
          url={merchant.photo_url}
          path={photoPaths.merchant(merchant.id)}
          shape="wide"
          onSaved={(url) => update.mutateAsync({ photo_url: url })}
        />
        <AppText variant="muted">{t('merchant.minisite.coverHint')}</AppText>
      </Card>

      {pro ? (
        <>
          <Card>
            <PhotoField
              testID="minisite-logo"
              label={t('merchant.minisite.logo')}
              url={merchant.logo_url}
              path={photoPaths.logo(merchant.id)}
              shape="square"
              onSaved={(url) => update.mutateAsync({ logo_url: url })}
            />
          </Card>
          <Card>
            <TextField
              testID="minisite-tagline"
              label={t('merchant.minisite.tagline')}
              value={tagline}
              onChangeText={setTagline}
              maxLength={100}
            />
            <TextField
              testID="minisite-about"
              label={t('merchant.minisite.about')}
              value={about}
              onChangeText={setAbout}
              maxLength={1000}
              multiline
            />
            {dirty ? (
              <Button
                testID="minisite-save"
                title={t('common.save')}
                loading={update.isPending}
                onPress={() =>
                  update.mutate({ tagline: tagline.trim() || null, about: about.trim() || null })
                }
              />
            ) : null}
          </Card>
          <Card>
            <AppText variant="subtitle">{t('merchant.minisite.color')}</AppText>
            <View style={styles.colors}>
              {ACCENT_NAMES.map((name) => (
                <Pressable
                  key={name}
                  testID={`accent-${name}`}
                  accessibilityRole="button"
                  accessibilityLabel={t(`merchant.minisite.colors.${name}`)}
                  accessibilityState={{ selected: merchant.accent_color === name }}
                  onPress={() => update.mutate({ accent_color: name })}
                  style={[
                    styles.swatch,
                    { backgroundColor: ACCENT_COLORS[name] },
                    merchant.accent_color === name && styles.swatchSelected,
                  ]}
                />
              ))}
              {merchant.accent_color ? (
                <Chip
                  label={t('merchant.minisite.noColor')}
                  onPress={() => update.mutate({ accent_color: null })}
                />
              ) : null}
            </View>
          </Card>
        </>
      ) : null}

      <Card>
        <AppText variant="subtitle">{t('merchant.minisite.sourcesTitle')}</AppText>
        <AppText variant="muted">{t('merchant.minisite.sources')}</AppText>
        <View style={styles.actions}>
          <Button
            variant="ghost"
            title={t('merchant.shop.info')}
            onPress={() => router.push('/pro/info')}
          />
          <Button
            variant="ghost"
            title={t('merchant.shop.hours')}
            onPress={() => router.push('/pro/hours')}
          />
          <Button
            variant="ghost"
            title={t('merchant.happyHours.title')}
            onPress={() => router.push('/pro/happy-hours')}
          />
        </View>
      </Card>

      {update.error ? <AppText variant="error">{t(errorKey(update.error))}</AppText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: { borderColor: '#111827' },
});
