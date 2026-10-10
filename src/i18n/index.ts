import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import fr from './locales/fr/translation.json';

// Langues prévues : 'ar' (arabe/darija) viendra s'ajouter ici, avec le RTL.
export const supportedLanguages = ['fr'] as const;
export type Language = (typeof supportedLanguages)[number];

export const resources = { fr: { translation: fr } } as const;

const deviceLanguage = getLocales()[0]?.languageCode;
const initialLanguage: Language = supportedLanguages.includes(deviceLanguage as Language)
  ? (deviceLanguage as Language)
  : 'fr';

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: 'fr',
  // Ressources embarquées : initialisation synchrone, pas de flash de clés au démarrage.
  initAsync: false,
  interpolation: { escapeValue: false },
});

export default i18n;
