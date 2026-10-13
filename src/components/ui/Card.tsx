import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { radius, spacing, useThemeColors } from '@/theme';

export function Card({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  const colors = useThemeColors();
  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
});
