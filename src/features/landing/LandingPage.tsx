import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router } from 'expo-router';
import Head from 'expo-router/head';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Logo } from '@/components/Logo';
import { AppText, Button } from '@/components/ui';
import { formatPrice } from '@/features/billing/plans';
import { type Space, useSpace } from '@/features/space/SpaceProvider';
import { radius, spacing, useThemeColors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const MODEL = [
  { id: 'sellers', icon: 'storefront-outline' },
  { id: 'price', icon: 'pricetag-outline' },
  { id: 'subscription', icon: 'calendar-outline' },
] as const;
const CUSTOMERS = [
  { id: 'pay', icon: 'card-outline' },
  { id: 'ready', icon: 'navigate-outline' },
  { id: 'pickup', icon: 'qr-code-outline' },
  { id: 'loyalty', icon: 'gift-outline' },
] as const;
const RESTAURANTS = [
  { id: 'commission', icon: 'cash-outline' },
  { id: 'live', icon: 'notifications-outline' },
  { id: 'timing', icon: 'time-outline' },
  { id: 'menu', icon: 'restaurant-outline' },
  { id: 'loyalty', icon: 'heart-outline' },
  { id: 'payouts', icon: 'wallet-outline' },
] as const;
const STEPS = ['choose', 'pay', 'collect'] as const;
const COMPARISON = ['commission', 'customerFees', 'customerPrice', 'restaurantCost'] as const;
const PRICING = ['unlimited', 'commission', 'tools', 'trial', 'noCommitment'] as const;
const FAQ = ['sell', 'fees', 'restaurantCost', 'delivery', 'trial', 'charge'] as const;
const BADGES = ['commission', 'fees', 'trial'] as const;

/** Largeur utile et nombre de colonnes selon l'écran (téléphone, tablette, ordinateur). */
function useColumns(wideColumns = 3) {
  const { width } = useWindowDimensions();
  return { wide: width >= 900, columns: width >= 1000 ? wideColumns : width >= 640 ? 2 : 1 };
}

function Section({
  title,
  children,
  testID,
  tinted,
}: {
  title?: string;
  children: ReactNode;
  testID?: string;
  tinted?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View testID={testID} style={[styles.section, tinted && { backgroundColor: colors.surface }]}>
      <View style={styles.container}>
        {title ? (
          <AppText variant="title" style={styles.sectionTitle} accessibilityRole="header">
            {title}
          </AppText>
        ) : null}
        {children}
      </View>
    </View>
  );
}

/** Grille de cartes ; wideColumns : colonnes sur grand écran (4 cartes → 4 colonnes, pas d'orpheline). */
function Grid({ children, wideColumns = 3 }: { children: ReactNode[]; wideColumns?: number }) {
  const { columns } = useColumns(wideColumns);
  return (
    <View style={styles.grid}>
      {children.map((child, index) => (
        <View key={index} style={{ width: `${100 / columns}%`, padding: spacing.sm }}>
          {child}
        </View>
      ))}
    </View>
  );
}

function Feature({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const colors = useThemeColors();
  return (
    <View
      style={[styles.feature, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={[styles.featureIcon, { backgroundColor: colors.surface }]}>
        <Ionicons name={icon} size={24} color={colors.brand} />
      </View>
      <AppText variant="subtitle">{title}</AppText>
      <AppText variant="muted">{body}</AppText>
    </View>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.faqItem, { borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.faqQuestion}>
        <AppText variant="subtitle" style={styles.flex}>
          {question}
        </AppText>
        <Ionicons name={open ? 'remove' : 'add'} size={22} color={colors.brand} />
      </Pressable>
      {open ? <AppText variant="muted">{answer}</AppText> : null}
    </View>
  );
}

/**
 * Page d'accueil de l'app web (app.zeeroo.fr). Message central : ZeeRoo est un service. Le client
 * paie le prix de la carte, le restaurant un abonnement fixe, sans commission.
 */
export function LandingPage() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { wide } = useColumns();
  const { setSpace } = useSpace();

  // Mémorise l'espace visé : après inscription, l'utilisateur arrive au bon endroit.
  const start = (space: Space) => {
    setSpace(space);
    router.push('/sign-up');
  };

  const ctas = (
    <View style={[styles.ctas, !wide && styles.ctasStacked]}>
      <Button
        testID="landing-cta-customer"
        title={t('landing.hero.ctaCustomer')}
        onPress={() => start('client')}
      />
      <Button
        testID="landing-cta-restaurant"
        variant="secondary"
        title={t('landing.hero.ctaRestaurant')}
        onPress={() => start('merchant')}
      />
    </View>
  );

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
      <Head>
        <title>{t('landing.metaTitle')}</title>
        <meta name="description" content={t('landing.metaDescription')} />
        <meta property="og:title" content={t('landing.metaTitle')} />
        <meta property="og:description" content={t('landing.metaDescription')} />
        <meta property="og:url" content="https://app.zeeroo.fr" />
      </Head>

      {/* En-tête */}
      <View style={[styles.header, { borderColor: colors.border }]}>
        <View style={[styles.container, styles.headerRow]}>
          <Logo height={36} />
          <Button
            variant="ghost"
            title={t('landing.signIn')}
            onPress={() => router.push('/sign-in')}
          />
        </View>
      </View>

      {/* Accroche */}
      <Section testID="landing-hero">
        <View style={styles.hero}>
          <Logo height={wide ? 150 : 96} />
          <AppText
            style={[styles.heroTitle, wide && styles.heroTitleWide]}
            accessibilityRole="header">
            {t('landing.hero.title')}
          </AppText>
          <AppText style={styles.heroSubtitle} variant="muted">
            {t('landing.hero.subtitle')}
          </AppText>
          <View style={styles.badges}>
            {BADGES.map((badge) => (
              <View
                key={badge}
                style={[
                  styles.badge,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <AppText>{t(`landing.hero.badges.${badge}`)}</AppText>
              </View>
            ))}
          </View>
          {ctas}
          <AppText variant="muted" style={styles.center}>
            {t('landing.hero.stores')}
          </AppText>
        </View>
      </Section>

      {/* Le modèle : un service */}
      <Section title={t('landing.model.title')} testID="landing-model" tinted>
        <Grid>
          {MODEL.map((item) => (
            <Feature
              key={item.id}
              icon={item.icon}
              title={t(`landing.model.items.${item.id}.title`)}
              body={t(`landing.model.items.${item.id}.body`)}
            />
          ))}
        </Grid>
      </Section>

      <Section title={t('landing.steps.title')}>
        <Grid>
          {STEPS.map((step, index) => (
            <View key={step} style={styles.step}>
              <View style={[styles.stepNumber, { backgroundColor: colors.brand }]}>
                <AppText style={{ color: colors.onBrand, fontWeight: '700' }}>{index + 1}</AppText>
              </View>
              <AppText variant="subtitle">{t(`landing.steps.items.${step}.title`)}</AppText>
              <AppText variant="muted">{t(`landing.steps.items.${step}.body`)}</AppText>
            </View>
          ))}
        </Grid>
      </Section>

      <Section title={t('landing.customers.title')} testID="landing-customers" tinted>
        <Grid wideColumns={4}>
          {CUSTOMERS.map((item) => (
            <Feature
              key={item.id}
              icon={item.icon}
              title={t(`landing.customers.items.${item.id}.title`)}
              body={t(`landing.customers.items.${item.id}.body`)}
            />
          ))}
        </Grid>
      </Section>

      <Section title={t('landing.restaurants.title')} testID="landing-restaurants">
        <Grid>
          {RESTAURANTS.map((item) => (
            <Feature
              key={item.id}
              icon={item.icon}
              title={t(`landing.restaurants.items.${item.id}.title`)}
              body={t(`landing.restaurants.items.${item.id}.body`)}
            />
          ))}
        </Grid>
      </Section>

      {/* Comparaison des coûts */}
      <Section title={t('landing.comparison.title')} testID="landing-comparison" tinted>
        <View
          style={[
            styles.table,
            { borderColor: colors.border, backgroundColor: colors.background },
          ]}>
          <View style={[styles.tableRow, { borderColor: colors.border }]}>
            <AppText style={styles.tableLabel} />
            <AppText variant="subtitle" style={[styles.tableCell, { color: colors.link }]}>
              {t('landing.comparison.headers.zeroo')}
            </AppText>
            <AppText variant="subtitle" style={styles.tableCell}>
              {t('landing.comparison.headers.others')}
            </AppText>
          </View>
          {COMPARISON.map((row) => (
            <View key={row} style={[styles.tableRow, { borderColor: colors.border }]}>
              <AppText style={styles.tableLabel}>
                {t(`landing.comparison.rows.${row}.label`)}
              </AppText>
              <AppText style={[styles.tableCell, styles.strong]}>
                {t(`landing.comparison.rows.${row}.zeroo`)}
              </AppText>
              <AppText variant="muted" style={styles.tableCell}>
                {t(`landing.comparison.rows.${row}.others`)}
              </AppText>
            </View>
          ))}
        </View>
        <AppText style={styles.example}>{t('landing.comparison.example')}</AppText>
        <AppText variant="muted">{t('landing.comparison.note')}</AppText>
      </Section>

      {/* Tarif */}
      <Section title={t('landing.pricing.title')} testID="landing-pricing">
        <View style={styles.planRow}>
          {(['start', 'pro', 'courier'] as const).map((plan) => {
            const month = formatPrice(plan, 'month');
            const year = formatPrice(plan, 'year');
            return (
              <View
                key={plan}
                testID={`landing-plan-${plan}`}
                style={[
                  styles.pricing,
                  { borderColor: colors.brand, backgroundColor: colors.background },
                ]}>
                <AppText variant="muted" style={styles.center}>
                  {plan === 'courier'
                    ? t('landing.pricing.couriers')
                    : t('landing.pricing.restaurants')}
                </AppText>
                <AppText variant="subtitle" style={styles.center}>
                  {t(`landing.pricing.plans.${plan}`)}
                </AppText>
                <AppText variant="muted" style={styles.center}>
                  {t(`landing.pricing.planInfo.${plan}`)}
                </AppText>
                <View style={styles.priceRow}>
                  <AppText style={[styles.price, { color: colors.link }]}>{month.ht}</AppText>
                  <AppText variant="muted">{t('landing.pricing.perMonth')}</AppText>
                </View>
                <AppText variant="muted" style={styles.center}>
                  {t('landing.pricing.ttcMonth', { ttc: month.ttc })}
                </AppText>
                <AppText style={styles.center}>
                  {t('landing.pricing.yearly', { ht: year.ht, ttc: year.ttc })}
                </AppText>
              </View>
            );
          })}
        </View>
        <View style={styles.pricingFeatures}>
          {PRICING.map((feature) => (
            <View key={feature} style={styles.pricingFeature}>
              <Ionicons name="checkmark" size={20} color={colors.success} />
              <AppText>{t(`landing.pricing.features.${feature}`)}</AppText>
            </View>
          ))}
        </View>
        <Button title={t('landing.pricing.cta')} onPress={() => start('merchant')} />
        <AppText variant="muted" style={styles.center}>
          {t('landing.pricing.customers')}
        </AppText>
      </Section>

      <Section title={t('landing.faq.title')} testID="landing-faq" tinted>
        <View
          style={[styles.faq, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {FAQ.map((item) => (
            <FaqItem
              key={item}
              question={t(`landing.faq.items.${item}.q`)}
              answer={t(`landing.faq.items.${item}.a`)}
            />
          ))}
        </View>
      </Section>

      <Section>
        <View style={styles.hero}>
          <AppText variant="title" style={styles.center}>
            {t('landing.final.title')}
          </AppText>
          {ctas}
        </View>
      </Section>

      <View style={[styles.footer, { borderColor: colors.border }]}>
        <View style={[styles.container, styles.footerRow]}>
          <AppText variant="muted">{t('landing.footer.tagline')}</AppText>
          <View style={styles.footerLinks}>
            <Link href="/mentions-legales">
              <AppText variant="link">{t('landing.footer.legal')}</AppText>
            </Link>
            <Link href="/confidentialite">
              <AppText variant="link">{t('landing.footer.privacy')}</AppText>
            </Link>
            <AppText variant="muted">
              {t('landing.footer.copyright', { year: new Date().getFullYear() })}
            </AppText>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1 },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  strong: { fontWeight: '700' },
  container: { width: '100%', maxWidth: 1100, alignSelf: 'center', paddingHorizontal: spacing.md },
  header: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { paddingVertical: spacing.xl * 1.5 },
  sectionTitle: { textAlign: 'center', marginBottom: spacing.lg },
  hero: { alignItems: 'center', gap: spacing.lg, maxWidth: 820, alignSelf: 'center' },
  heroTitle: { fontSize: 36, lineHeight: 42, fontWeight: '800', textAlign: 'center' },
  heroTitleWide: { fontSize: 52, lineHeight: 60 },
  heroSubtitle: { fontSize: 18, lineHeight: 27, textAlign: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  ctas: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  ctasStacked: { flexDirection: 'column', alignSelf: 'stretch' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -spacing.sm },
  feature: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  step: { gap: spacing.sm, alignItems: 'flex-start', padding: spacing.sm },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  table: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
  },
  tableLabel: { flex: 1.4 },
  tableCell: { flex: 1 },
  example: { marginTop: spacing.lg, fontWeight: '600' },
  planRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  pricing: {
    borderWidth: 2,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    flexGrow: 1,
    flexBasis: 240,
    maxWidth: 440,
  },
  pricingFeatures: { gap: spacing.sm, alignSelf: 'center' },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  price: { fontSize: 48, fontWeight: '800' },
  pricingFeature: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  faq: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    maxWidth: 820,
    alignSelf: 'center',
    width: '100%',
  },
  faqItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  faqQuestion: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.lg },
  footerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'center' },
});
