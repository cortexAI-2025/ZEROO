import { StyleSheet, Text, View } from 'react-native';

import { radius, spacing, useThemeColors } from '@/theme';

type Bar = { label: string; value: number };

/**
 * Histogramme simple (7 jours) : la dernière barre, aujourd'hui, est mise en avant et porte
 * sa valeur. Le résumé complet est lu par les lecteurs d'écran.
 */
export function BarChart({
  bars,
  format,
  height = 120,
}: {
  bars: Bar[];
  format: (value: number) => string;
  height?: number;
}) {
  const colors = useThemeColors();
  const max = Math.max(1, ...bars.map((b) => b.value));
  const summary = bars.map((b) => `${b.label} : ${format(b.value)}`).join(', ');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      <View style={[styles.bars, { height }]}>
        {bars.map((bar, i) => {
          const last = i === bars.length - 1;
          return (
            <View key={`${bar.label}-${i}`} style={styles.col}>
              {last ? (
                <Text style={[styles.value, { color: colors.text }]} numberOfLines={1}>
                  {format(bar.value)}
                </Text>
              ) : null}
              <View
                style={[
                  styles.bar,
                  {
                    height: `${Math.max(3, Math.round((bar.value / max) * 78))}%` as const,
                    backgroundColor: last ? colors.brandLime : colors.border,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.labels}>
        {bars.map((bar, i) => (
          <Text
            key={`${bar.label}-${i}`}
            style={[
              styles.label,
              { color: i === bars.length - 1 ? colors.text : colors.textMuted },
            ]}>
            {bar.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  col: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '100%', borderRadius: radius.sm },
  value: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  labels: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  label: { flex: 1, textAlign: 'center', fontSize: 12 },
});
