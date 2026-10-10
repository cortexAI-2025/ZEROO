import { StyleSheet, Text, View } from 'react-native';

import { radius, spacing, useThemeColors } from '@/theme';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

export function Badge({
  label,
  tone = 'neutral',
  testID,
}: {
  label: string;
  tone?: Tone;
  testID?: string;
}) {
  const colors = useThemeColors();
  const background = {
    success: colors.success,
    warning: colors.brand,
    danger: colors.danger,
    neutral: colors.border,
  }[tone];
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: background }]}>
      <Text style={[styles.label, { color: tone === 'neutral' ? colors.text : colors.onBrand }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  label: { fontSize: 13, fontWeight: '700' },
});
