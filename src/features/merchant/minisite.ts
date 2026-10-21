import type { Merchant } from './types';

/** Palette du mini-site : des couleurs choisies pour rester lisibles (texte blanc dessus). */
export const ACCENT_COLORS = {
  green: '#2E7D32',
  orange: '#E65100',
  blue: '#1565C0',
  red: '#C62828',
  purple: '#6A1B9A',
  dark: '#263238',
} as const;
export type AccentColor = keyof typeof ACCENT_COLORS;
export const ACCENT_NAMES = Object.keys(ACCENT_COLORS) as AccentColor[];

export type SiteStyle = {
  /** Mini-site Pro actif : personnalisation affichée. Sinon : fiche de commande Start. */
  personalized: boolean;
  logoUrl: string | null;
  tagline: string | null;
  about: string | null;
  accent: string | null;
};

type SiteFields = Pick<
  Merchant,
  'logo_url' | 'tagline' | 'about' | 'accent_color' | 'has_minisite'
>;

/**
 * Ce que la fiche publique montre de la personnalisation. Sans formule Pro en cours, rien n'est
 * montré (les réglages restent enregistrés et reviennent avec Pro) : la fiche garde son contenu de
 * commande (nom, horaires, menu, commande, Happy Hours), jamais un lien cassé.
 */
export function siteStyle(m: SiteFields): SiteStyle {
  if (!m.has_minisite) {
    return { personalized: false, logoUrl: null, tagline: null, about: null, accent: null };
  }
  const accent =
    m.accent_color && m.accent_color in ACCENT_COLORS
      ? ACCENT_COLORS[m.accent_color as AccentColor]
      : null;
  return {
    personalized: true,
    logoUrl: m.logo_url,
    tagline: m.tagline?.trim() || null,
    about: m.about?.trim() || null,
    accent,
  };
}
