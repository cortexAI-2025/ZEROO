import { useTranslation } from 'react-i18next';

import { LegalPage } from '@/features/landing/LegalPage';

const SECTIONS = [
  'controller',
  'data',
  'purposes',
  'recipients',
  'retention',
  'rights',
  'storage',
] as const;

export default function PrivacyScreen() {
  const { t } = useTranslation();
  return (
    <LegalPage
      title={t('legal.privacy.title')}
      sections={SECTIONS.map((id) => ({
        title: t(`legal.privacy.sections.${id}.title`),
        body: t(`legal.privacy.sections.${id}.body`),
      }))}
    />
  );
}
