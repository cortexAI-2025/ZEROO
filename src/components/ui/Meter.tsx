import { StyleSheet, View } from 'react-native';

import { radius, useThemeColors } from '@/theme';

/** Barre de progression horizontale (part d'un total, de 0 à 1). */
export function Meter({ ratio }: { ratio: number }) {
  const colors = useThemeColors();
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <View style={[styles.track, { backgroundColor: colors.border }]}>
      <View
        style={[styles.fill, { width: `${pct}%` as const, backgroundColor: colors.brandLime }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flex: 1, height: 8, borderRadius: radius.sm, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.sm },
});
