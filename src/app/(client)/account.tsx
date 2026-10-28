import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormTextField } from '@/components/form/FormTextField';
import { AppText, Button, Card, ListRow } from '@/components/ui';
import { requestEmailChange, type Profile } from '@/features/account/api';
import {
  useAddresses,
  useFavoriteIds,
  useProfile,
  useUpdateProfile,
} from '@/features/account/hooks';
import { AccountScreen } from '@/features/auth/AccountScreen';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatPhone } from '@/features/auth/phone';
import {
  profileSchema,
  resetRequestSchema,
  type ProfileValues,
  type ResetRequestValues,
} from '@/features/auth/schemas';
import { errorKey } from '@/lib/errors';

export default function ClientAccountScreen() {
  const { t } = useTranslation();
  const profile = useProfile();
  const addresses = useAddresses();
  const favorites = useFavoriteIds();
  const defaultAddress = addresses.data?.find((a) => a.is_default) ?? addresses.data?.[0];
  return (
    <AccountScreen>
      {profile.isPending ? (
        <AppText>{t('common.loading')}</AppText>
      ) : profile.isError || !profile.data ? (
        <Card>
          <AppText variant="error">{t('client.account.profileError')}</AppText>
          <Button title={t('common.retry')} onPress={() => void profile.refetch()} />
        </Card>
      ) : (
        <ProfileCard key={profile.data.id} profile={profile.data} />
      )}
      <EmailCard />
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

function valuesFrom(profile: Profile): ProfileValues {
  return {
    firstName: profile.first_name ?? '',
    lastName: profile.last_name ?? '',
    addressLine: profile.address_line ?? '',
    postalCode: profile.postal_code ?? '',
    city: profile.city ?? '',
    phone: profile.phone ?? '',
  };
}

function ProfileCard({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateProfile();
  const { control, handleSubmit, reset, formState } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: valuesFrom(profile),
  });
  const begin = () => {
    reset(valuesFrom(profile));
    setMessage(null);
    setError(null);
    setEditing(true);
  };
  const save = handleSubmit(async (values) => {
    setError(null);
    setMessage(null);
    try {
      await update.mutateAsync(values);
      setEditing(false);
      setMessage(t('client.account.saved'));
    } catch (e) {
      setError(t(errorKey(e)));
    }
  });
  const missing = t('client.account.missing');
  return (
    <Card testID="client-profile">
      <AppText variant="subtitle">{t('client.account.profile')}</AppText>
      {editing ? (
        <>
          <AppText variant="muted">{t('client.account.required')}</AppText>
          <FormTextField
            control={control}
            name="firstName"
            label={t('auth.firstName')}
            maxLength={80}
            autoComplete="given-name"
            textContentType="givenName"
            editable={!formState.isSubmitting}
          />
          <FormTextField
            control={control}
            name="lastName"
            label={t('auth.lastName')}
            maxLength={80}
            autoComplete="family-name"
            textContentType="familyName"
            editable={!formState.isSubmitting}
          />
          <FormTextField
            control={control}
            name="addressLine"
            label={t('auth.addressLine')}
            maxLength={240}
            autoComplete="street-address"
            textContentType="streetAddressLine1"
            editable={!formState.isSubmitting}
          />
          <FormTextField
            control={control}
            name="postalCode"
            label={t('auth.postalCode')}
            maxLength={5}
            autoComplete="postal-code"
            textContentType="postalCode"
            keyboardType="number-pad"
            editable={!formState.isSubmitting}
          />
          <FormTextField
            control={control}
            name="city"
            label={t('auth.city')}
            maxLength={100}
            textContentType="addressCity"
            editable={!formState.isSubmitting}
          />
          <FormTextField
            control={control}
            name="phone"
            label={t('auth.phone')}
            maxLength={30}
            autoComplete="tel"
            textContentType="telephoneNumber"
            keyboardType="phone-pad"
            editable={!formState.isSubmitting}
          />
          {error ? (
            <AppText variant="error" accessibilityRole="alert">
              {error}
            </AppText>
          ) : null}
          <Button
            testID="client-profile-save"
            title={t('common.save')}
            loading={formState.isSubmitting}
            onPress={() => void save()}
          />
          <Button
            title={t('common.cancel')}
            variant="secondary"
            disabled={formState.isSubmitting}
            onPress={() => {
              setEditing(false);
              setError(null);
            }}
          />
        </>
      ) : (
        <>
          {!profile.first_name && !profile.last_name && profile.display_name ? (
            <AppText>{profile.display_name}</AppText>
          ) : null}
          {(
            [
              ['firstName', profile.first_name],
              ['lastName', profile.last_name],
              ['address', profile.address_line],
              ['postalCode', profile.postal_code],
              ['city', profile.city],
              ['phone', formatPhone(profile.phone)],
            ] as const
          ).map(([key, value]) => (
            <AppText key={key}>
              <AppText variant="muted">
                {t(`client.account.${key}`)}
                {' : '}
              </AppText>
              {value || missing}
            </AppText>
          ))}
          {message ? <AppText accessibilityRole="alert">{message}</AppText> : null}
          <Button
            testID="client-profile-edit"
            title={t('client.account.edit')}
            variant="secondary"
            onPress={begin}
          />
        </>
      )}
      <AppText variant="muted">{t('client.account.mainAddressHint')}</AppText>
    </Card>
  );
}

function EmailCard() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState,
    setError: fieldError,
  } = useForm<ResetRequestValues>({
    resolver: zodResolver(resetRequestSchema),
    defaultValues: { email: '' },
  });
  const email = session?.user.email ?? '';
  const pendingEmail = pending || session?.user.new_email;
  const save = handleSubmit(async (values) => {
    setError(null);
    setMessage(null);
    if (values.email === email.toLowerCase()) {
      fieldError('email', { message: 'client.account.emailSame' });
      return;
    }
    try {
      const result = await requestEmailChange(values.email);
      setEditing(false);
      if (result.confirmed) {
        setPending(null);
        setMessage(t('client.account.emailUpdated'));
      } else setPending(result.email);
    } catch (e) {
      setError(t(errorKey(e)));
    }
  });
  return (
    <Card testID="client-email">
      <AppText variant="subtitle">{t('client.account.email')}</AppText>
      <AppText>{email}</AppText>
      {pendingEmail && pendingEmail !== email ? (
        <AppText accessibilityRole="alert">
          {t('client.account.emailPending', { email: pendingEmail })}
        </AppText>
      ) : null}
      {message ? <AppText accessibilityRole="alert">{message}</AppText> : null}
      {editing ? (
        <>
          <FormTextField
            control={control}
            name="email"
            label={t('client.account.newEmail')}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            editable={!formState.isSubmitting}
          />
          <AppText variant="muted">{t('client.account.emailHint')}</AppText>
          {error ? (
            <AppText variant="error" accessibilityRole="alert">
              {error}
            </AppText>
          ) : null}
          <Button
            testID="client-email-submit"
            title={t('client.account.emailSubmit')}
            loading={formState.isSubmitting}
            onPress={() => void save()}
          />
          <Button
            title={t('common.cancel')}
            variant="secondary"
            disabled={formState.isSubmitting}
            onPress={() => setEditing(false)}
          />
        </>
      ) : (
        <Button
          testID="client-email-edit"
          title={t('client.account.emailEdit')}
          variant="secondary"
          onPress={() => {
            reset({ email: '' });
            setError(null);
            setMessage(null);
            setEditing(true);
          }}
        />
      )}
    </Card>
  );
}
