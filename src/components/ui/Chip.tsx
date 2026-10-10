import { Pressable, StyleSheet, Text } from 'react-native';

import { radius, spacing, useThemeColors } from '@/theme';

type Props = { label: string; selected?: boolean; onPress: () => void; testID?: string };

/** Pastille sélectionnable (délai, catégorie, raison…). */
export function Chip({ label, selected = false, onPress, testID }: Props) {
  const colors = useThemeColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.brand : colors.surface,
          borderColor: selected ? colors.brand : colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <Text style={[styles.label, { color: selected ? colors.onBrand : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
  },
  label: { fontSize: 15, fontWeight: '600' },
});
