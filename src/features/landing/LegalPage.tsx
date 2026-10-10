import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Screen } from '@/components/ui';
import { spacing } from '@/theme';

type Section = { title: string; body: string };

/** Page de texte légal : titre, sections, rappel des éléments à compléter. */
export function LegalPage({ title, sections }: { title: string; sections: Section[] }) {
  const { t } = useTranslation();
  return (
    <Screen scroll>
      <Stack.Screen options={{ title }} />
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      <AppText variant="muted">{t('legal.toComplete')}</AppText>
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <AppText variant="subtitle">{section.title}</AppText>
          <AppText>{section.body}</AppText>
        </View>
      ))}
      <Button variant="ghost" title={t('legal.back')} onPress={() => router.replace('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
});
