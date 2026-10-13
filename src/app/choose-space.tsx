import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { AppText, Screen } from '@/components/ui';
import { type Space, useSpace } from '@/features/space/SpaceProvider';
import { radius, spacing, useThemeColors } from '@/theme';

export default function ChooseSpaceScreen() {
  const { t } = useTranslation();
  const { setSpace } = useSpace();
  const colors = useThemeColors();

  const options: { space: Space; title: string; hint: string }[] = [
    { space: 'client', title: t('space.client'), hint: t('space.clientHint') },
    { space: 'merchant', title: t('space.merchant'), hint: t('space.merchantHint') },
    { space: 'courier', title: t('space.courier'), hint: t('space.courierHint') },
  ];

  return (
    <Screen centered>
      <AppText variant="title">{t('space.title')}</AppText>
      {options.map((option) => (
        <Pressable
          key={option.space}
          testID={`choose-space-${option.space}`}
          accessibilityRole="button"
          onPress={() => setSpace(option.space)}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs },
});
