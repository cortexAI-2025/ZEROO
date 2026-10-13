import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColors } from '@/theme';

type Variant = 'title' | 'subtitle' | 'body' | 'muted' | 'error' | 'link';

export function AppText({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  const colors = useThemeColors();
  const color =
    variant === 'muted'
      ? colors.textMuted
      : variant === 'error'
        ? colors.danger
        : variant === 'link'
          ? colors.link
          : colors.text;

  return <Text style={[styles[variant], { color }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700', textAlign: 'auto' },
  subtitle: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 16 },
  muted: { fontSize: 14 },
  error: { fontSize: 14 },
  link: { fontSize: 15, fontWeight: '600' },
});
