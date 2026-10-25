import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { signOut } from '@/features/auth/api';
import { errorKey } from '@/lib/errors';

import { AppText, Button, Screen } from '@/components/ui';
import { type Space, useSpace } from '@/features/space/SpaceProvider';
import { radius, spacing, useThemeColors } from '@/theme';

export default function ChooseSpaceScreen() {
  const { t } = useTranslation();
  const { chooseSpace, signUpSpace } = useSpace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choose = async (space: Space) => {
    setBusy(true);
    setError(null);
    try {
      await chooseSpace(space);
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };
  const colors = useThemeColors();

  const options: { space: Space; title: string; hint: string }[] = [
    { space: 'client', title: t('space.client'), hint: t('space.clientHint') },
    { space: 'merchant', title: t('space.merchant'), hint: t('space.merchantHint') },
    { space: 'courier', title: t('space.courier'), hint: t('space.courierHint') },
  ];

  return (
    <Screen centered>
      <AppText variant="title">{t('space.title')}</AppText>
      <AppText variant="muted">{t('space.permanentHint')}</AppText>
      {options
        .sort((a, b) => Number(b.space === signUpSpace) - Number(a.space === signUpSpace))
        .map((option) => (
          <Pressable
            key={option.space}
            testID={`choose-space-${option.space}`}
            accessibilityRole="button"
            disabled={busy}
            accessibilityState={{ disabled: busy, busy }}
            onPress={() => void choose(option.space)}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <AppText variant="subtitle">{option.title}</AppText>
            <AppText variant="muted">{option.hint}</AppText>
          </Pressable>
        ))}
      {error ? <AppText variant="error">{error}</AppText> : null}
      <Button variant="ghost" title={t('account.signOut')} onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs },
});
