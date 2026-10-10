import { useTranslation } from 'react-i18next';

import { LegalPage } from '@/features/landing/LegalPage';

const SECTIONS = ['editor', 'service', 'hosting', 'ip'] as const;

export default function LegalNoticeScreen() {
  const { t } = useTranslation();
  return (
    <LegalPage
      title={t('legal.mentions.title')}
      sections={SECTIONS.map((id) => ({
        title: t(`legal.mentions.sections.${id}.title`),
        body: t(`legal.mentions.sections.${id}.body`),
      }))}
    />
  );
}
