import { useColorScheme } from 'react-native';

// Couleurs du logo ZeeRoo : vert vif #3AAD17 et encre #0B1C1C. Le vert vif n'a que 2,9:1 avec
// le blanc : les boutons utilisent un vert plus soutenu (contraste 5:1 avec le texte blanc).
const palette = {
  brand: '#2A8010',
  brandPressed: '#226A0C',
  brandLime: '#3AAD17',
  brandForest: '#0B1C1C',
  danger: '#DC2626',
  success: '#16A34A',
};

type ColorTokens = Record<
  | keyof typeof palette
  | 'text'
  | 'textMuted'
  | 'background'
  | 'surface'
  | 'border'
  | 'link'
  | 'onBrand',
  string
>;

export const colors: { light: ColorTokens; dark: ColorTokens } = {
  light: {
    ...palette,
    text: '#0B1C1C',
    textMuted: '#6B7280',
    background: '#FFFFFF',
    surface: '#F3F4F6',
    border: '#E5E7EB',
    link: '#2A8010', // texte coloré sur fond clair : 5:1
    onBrand: '#FFFFFF',
  },
  dark: {
    ...palette,
    text: '#F9FAFB',
    textMuted: '#9CA3AF',
    background: '#0B0B0C',
    surface: '#1C1C1F',
    border: '#2D2D31',
    link: '#7ED957', // texte coloré sur fond sombre : 11,2:1
    onBrand: '#FFFFFF',
  },
};

export type ThemeColors = ColorTokens;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 20 } as const;

export function useThemeColors(): ThemeColors {
  return useColorScheme() === 'dark' ? colors.dark : colors.light;
}
