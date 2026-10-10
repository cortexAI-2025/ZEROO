import 'i18next';

import type { resources } from './index';

// Clés de traduction typées : t('auth.signIn') est vérifié à la compilation.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: (typeof resources)['fr'];
  }
}
