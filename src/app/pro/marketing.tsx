import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Badge,
  Button,
  Card,
  QueryState,
  Screen,
  SwitchRow,
  TextField,
} from '@/components/ui';
import { ProUpsell } from '@/features/billing/ProUpsell';
import { useMerchantPlan } from '@/features/billing/useMerchantPlan';
import type { CampaignWithHistory } from '@/features/marketing/api';
import { useMyCampaigns, useUpdateCaption } from '@/features/marketing/hooks';
import { useCurrentMerchant, useUpdateMerchant } from '@/features/merchant/hooks';
import { formatDay } from '@/lib/dates';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme';

function CampaignCard({
  campaign,
  merchantId,
}: {
  campaign: CampaignWithHistory;
  merchantId: string;
}) {
  const { t } = useTranslation();
  const save = useUpdateCaption(merchantId);
  const [caption, setCaption] = useState(campaign.caption);
  const editable = campaign.status === 'pending_review' || campaign.status === 'failed';
  const tone =
    campaign.status === 'published'
      ? 'success'
      : campaign.status === 'failed' || campaign.status === 'rejected'
        ? 'danger'
        : 'warning';
  return (
    <Card testID={`campaign-${campaign.id}`}>
      <View style={styles.header}>
        <AppText variant="subtitle" style={styles.flex}>
          {t('merchant.marketing.cycle', { date: formatDay(campaign.cycle_start) })}
        </AppText>
        <Badge label={t(`merchant.marketing.statuses.${campaign.status}`)} tone={tone} />
      </View>
      {campaign.scheduled_for ? (
        <AppText variant="muted">
          {t('merchant.marketing.scheduledFor', { date: formatDay(campaign.scheduled_for) })}
        </AppText>
      ) : null}
      {campaign.last_error ? <AppText variant="error">{campaign.last_error}</AppText> : null}
      {editable ? (
        <>
          <TextField
            label={t('merchant.marketing.caption')}
            value={caption}
            onChangeText={setCaption}
            maxLength={600}
            multiline
          />
          {caption.trim() !== campaign.caption ? (
            <Button
              variant="secondary"
              title={t('merchant.marketing.saveCaption')}
              loading={save.isPending}
              onPress={() => save.mutate({ id: campaign.id, caption })}
            />
          ) : null}
          {save.error ? <AppText variant="error">{t(errorKey(save.error))}</AppText> : null}
        </>
      ) : (
        <AppText>{campaign.caption}</AppText>
      )}
      {campaign.marketing_publications.map((p) => (
        <AppText key={p.id} variant="muted">
          {p.platform} · {p.status}
          {p.post_url ? ` · ${p.post_url}` : ''}
        </AppText>
      ))}
    </Card>
  );
}

/** Campagne marketing mensuelle (formule Pro) : consentement, file d'attente et historique. */
export default function MarketingScreen() {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const update = useUpdateMerchant(merchant.id);
  const plan = useMerchantPlan(merchant.id);
  const campaigns = useMyCampaigns(merchant.id, plan.has('marketing_campaign'));

  if (!plan.isLoading && !plan.has('marketing_campaign')) {
    return (
      <Screen scroll>
        <ProUpsell feature={t('merchant.marketing.proFeature')} />
      </Screen>
    );
  }
  if (!campaigns.data)
    return <QueryState error={campaigns.error} onRetry={() => void campaigns.refetch()} />;

  return (
    <Screen scroll>
      <AppText variant="muted">{t('merchant.marketing.hint')}</AppText>
      <Card>
        <SwitchRow
          testID="marketing-consent"
          label={t('merchant.marketing.consent')}
          hint={t('merchant.marketing.consentHint')}
          value={merchant.marketing_consent}
          onValueChange={(value) => update.mutate({ marketing_consent: value })}
        />
      </Card>
      {update.error ? <AppText variant="error">{t(errorKey(update.error))}</AppText> : null}
      {campaigns.data.length === 0 ? (
        <AppText variant="muted">{t('merchant.marketing.empty')}</AppText>
      ) : (
        campaigns.data.map((c) => <CampaignCard key={c.id} campaign={c} merchantId={merchant.id} />)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
