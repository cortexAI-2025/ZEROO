import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Card, ListRow, TextField } from '@/components/ui';
import type { Profile } from '@/features/account/api';
import {
  useAddresses,
  useFavoriteIds,
  useProfile,
  useUpdateProfile,
} from '@/features/account/hooks';
import { AccountScreen } from '@/features/auth/AccountScreen';
import { errorKey } from '@/lib/errors';

const PHONE = /^(\+?\d[\d .-]{7,18})?$/;

/** Compte du client : informations personnelles, adresses, favoris, puis actions du compte. */
export default function ClientAccountScreen() {
  const { t } = useTranslation();
  const profile = useProfile();
  const addresses = useAddresses();
  const favorites = useFavoriteIds();
  const defaultAddress = addresses.data?.find((a) => a.is_default) ?? addresses.data?.[0];

  return (
    <AccountScreen>
      {profile.data ? <ProfileCard key={profile.data.id} profile={profile.data} /> : null}
      <Card>
        <ListRow
          testID="client-addresses"
          title={t('client.addresses.title')}
          subtitle={
            defaultAddress
              ? `${defaultAddress.label} · ${defaultAddress.address_line}`
              : t('client.addresses.none')
          }
          onPress={() => router.push('/addresses')}
        />
        <ListRow
          testID="client-favorites"
          title={t('client.favorites.title')}
          subtitle={t('client.favorites.count', { count: favorites.data?.size ?? 0 })}
          onPress={() => router.push('/favorites')}
        />
      </Card>
    </AccountScreen>
  );
}

/** Nom et téléphone, préremplis depuis le profil. */
function ProfileCard({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const update = useUpdateProfile();
  const [name, setName] = useState(profile.display_name ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [message, setMessage] = useState<string | null>(null);

  const phoneValid = PHONE.test(phone.trim());
  const save = async () => {
    setMessage(null);
    try {
      await update.mutateAsync({ display_name: name.trim() || null, phone: phone.trim() || null });
      setMessage(t('client.account.saved'));
    } catch (e) {
      setMessage(t(errorKey(e)));
    }
  };

  return (
    <Card testID="client-profile">
      <AppText variant="subtitle">{t('client.account.profile')}</AppText>
      <TextField
        label={t('client.account.name')}
        value={name}
        onChangeText={setName}
        maxLength={80}
        autoComplete="name"
      />
      <TextField
        label={t('client.account.phone')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={20}
        error={phoneValid ? undefined : t('merchant.errors.phoneInvalid')}
      />
      <Button
        variant="secondary"
        title={t('common.save')}
        disabled={!phoneValid}
        loading={update.isPending}
        onPress={() => void save()}
      />
      {message ? <AppText variant="muted">{message}</AppText> : null}
    </Card>
  );
}
