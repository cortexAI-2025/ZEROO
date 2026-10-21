import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, Chip, QueryState, Screen, TextField } from '@/components/ui';
import type { AdminCampaign, CampaignStatus } from '@/features/marketing/api';
import {
  useAdminCampaignActions,
  useAdminCampaigns,
  useIsPlatformAdmin,
} from '@/features/marketing/hooks';
import { formatDay } from '@/lib/dates';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme';

const STATUSES: CampaignStatus[] = [
  'pending_review',
  'scheduled',
  'failed',
  'published',
  'rejected',
  'cancelled',
];
const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'x', 'linkedin', 'other'] as const;

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function CampaignRow({ campaign }: { campaign: AdminCampaign }) {
  const { t } = useTranslation();
  const actions = useAdminCampaignActions();
  const [date, setDate] = useState(campaign.scheduled_for ?? tomorrow());
  const [caption, setCaption] = useState(campaign.caption);
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>('instagram');
  const [postUrl, setPostUrl] = useState('');
  const [failure, setFailure] = useState('');
  const error = actions.review.error ?? actions.record.error ?? actions.requeue.error;
  const tone =
    campaign.status === 'published'
      ? 'success'
      : campaign.status === 'failed' || campaign.status === 'rejected'
        ? 'danger'
        : 'warning';

  return (
    <Card testID={`admin-campaign-${campaign.id}`}>
      <View style={styles.header}>
        <AppText variant="subtitle" style={styles.flex}>
          {campaign.merchant_name} · {campaign.city}
        </AppText>
        <Badge label={t(`merchant.marketing.statuses.${campaign.status}`)} tone={tone} />
      </View>
      <AppText variant="muted">
        {t('merchant.marketing.cycle', { date: formatDay(campaign.cycle_start) })}
        {campaign.scheduled_for
          ? ` · ${t('merchant.marketing.scheduledFor', { date: formatDay(campaign.scheduled_for) })}`
          : ''}
      </AppText>
      {campaign.last_error ? (
        <AppText variant="error">
          {campaign.last_error} ({t('admin.attempts', { count: campaign.attempts })})
        </AppText>
      ) : null}

      {campaign.status === 'pending_review' ? (
        <>
          <TextField
            label={t('merchant.marketing.caption')}
            value={caption}
            onChangeText={setCaption}
            maxLength={600}
            multiline
          />
          <TextField
            label={t('admin.date')}
            value={date}
            onChangeText={setDate}
            placeholder="2026-11-05"
          />
          <View style={styles.row}>
            <Button
              testID="admin-approve"
              title={t('admin.approve')}
              loading={actions.review.isPending}
              onPress={() =>
                actions.review.mutate({
                  id: campaign.id,
                  approve: true,
                  scheduledFor: date,
                  caption: caption.trim() !== campaign.caption ? caption : undefined,
                })
              }
            />
            <Button
              variant="secondary"
              title={t('admin.reject')}
              onPress={() => actions.review.mutate({ id: campaign.id, approve: false })}
            />
          </View>
        </>
      ) : (
        <AppText>{campaign.caption}</AppText>
      )}

      {campaign.status === 'scheduled' || campaign.status === 'failed' ? (
        <>
          <View style={styles.row}>
            {PLATFORMS.map((p) => (
              <Chip key={p} label={p} selected={platform === p} onPress={() => setPlatform(p)} />
            ))}
          </View>
          <TextField
            label={t('admin.postUrl')}
            value={postUrl}
            onChangeText={setPostUrl}
            autoCapitalize="none"
          />
          <TextField label={t('admin.failureReason')} value={failure} onChangeText={setFailure} />
          <View style={styles.row}>
            <Button
              testID="admin-published"
              title={t('admin.markPublished')}
              onPress={() =>
                actions.record.mutate({ id: campaign.id, platform, ok: true, postUrl })
              }
            />
            <Button
              variant="secondary"
              title={t('admin.markFailed')}
              onPress={() =>
                actions.record.mutate({ id: campaign.id, platform, ok: false, error: failure })
              }
            />
          </View>
        </>
      ) : null}

      {campaign.status === 'failed' && campaign.attempts < 5 ? (
        <>
          <TextField label={t('admin.date')} value={date} onChangeText={setDate} />
          <Button
            variant="secondary"
            title={t('admin.requeue')}
            onPress={() => actions.requeue.mutate({ id: campaign.id, scheduledFor: date })}
          />
        </>
      ) : null}
      {error ? <AppText variant="error">{t(errorKey(error))}</AppText> : null}
    </Card>
  );
}

/** Administration ZeeRoo : validation et suivi des campagnes marketing (équipe uniquement). */
export default function AdminScreen() {
  const { t } = useTranslation();
  const admin = useIsPlatformAdmin();
  const [status, setStatus] = useState<CampaignStatus>('pending_review');
  const campaigns = useAdminCampaigns(status);

  if (admin.isPending)
    return <QueryState error={admin.error} onRetry={() => void admin.refetch()} />;
  if (!admin.data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('admin.title') }} />
        <AppText variant="error">{t('errors.adminRequired')}</AppText>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('admin.title') }} />
      <AppText variant="muted">{t('admin.hint')}</AppText>
      <View style={styles.row}>
        {STATUSES.map((s) => (
          <Chip
            key={s}
            testID={`admin-filter-${s}`}
            label={t(`merchant.marketing.statuses.${s}`)}
            selected={status === s}
            onPress={() => setStatus(s)}
          />
        ))}
      </View>
      {campaigns.data ? (
        campaigns.data.length === 0 ? (
          <AppText variant="muted">{t('admin.empty')}</AppText>
        ) : (
          campaigns.data.map((c) => <CampaignRow key={c.id} campaign={c} />)
        )
      ) : (
        <QueryState error={campaigns.error} onRetry={() => void campaigns.refetch()} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
});
