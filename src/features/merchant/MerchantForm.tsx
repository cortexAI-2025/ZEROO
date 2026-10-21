import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormTextField } from '@/components/form/FormTextField';
import { AppText, Button, Chip } from '@/components/ui';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme';

import { AddressField } from './AddressField';
import { merchantSchema, type MerchantFormValues } from './schemas';
import { MERCHANT_CATEGORIES, type Merchant, type MerchantCategory } from './types';

const PREP_CHOICES = [5, 10, 15, 20, 30];

export function merchantToFormValues(m: Merchant): MerchantFormValues {
  return {
    name: m.name,
    category: m.category as MerchantCategory,
    description: m.description ?? '',
    phone: m.phone ?? '',
    defaultPrepMinutes: m.default_prep_minutes,
    address: {
      addressLine: m.address_line ?? '',
      postalCode: m.postal_code,
      city: m.city,
      latitude: m.latitude ?? 0,
      longitude: m.longitude ?? 0,
    },
    legalName: m.legal_name ?? '',
    siret: m.siret ?? '',
    vatNumber: m.vat_number ?? '',
    contactEmail: m.contact_email ?? '',
  };
}

type Props = {
  initialValues?: MerchantFormValues;
  submitLabel: string;
  onSubmit: (values: MerchantFormValues) => Promise<void>;
};

/** Formulaire du commerce, partagé par la création et la modification. */
export function MerchantForm({ initialValues, submitLabel, onSubmit }: Props) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<MerchantFormValues>({
    resolver: zodResolver(merchantSchema),
    defaultValues: initialValues ?? {
      name: '',
      category: 'snack',
      description: '',
      phone: '',
      defaultPrepMinutes: 15,
      legalName: '',
      siret: '',
      vatNumber: '',
      contactEmail: '',
    },
  });

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit(values);
    } catch (e) {
      setError(t(errorKey(e)));
    }
  });

  return (
    <View style={styles.form}>
      <FormTextField
        control={control}
        name="name"
        label={t('merchant.form.name')}
        testID="merchant-name"
      />

      <AppText variant="muted">{t('merchant.form.category')}</AppText>
      <Controller
        control={control}
        name="category"
        render={({ field }) => (
          <View style={styles.chips}>
            {MERCHANT_CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={t(`merchant.categories.${c}`)}
                selected={field.value === c}
                onPress={() => field.onChange(c)}
              />
            ))}
          </View>
        )}
      />

      <Controller
        control={control}
        name="address"
        render={({ field, fieldState }) => (
          <AddressField
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error ? t('merchant.errors.addressRequired') : undefined}
          />
        )}
      />

      <FormTextField
        control={control}
        name="phone"
        label={t('merchant.form.phone')}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <FormTextField
        control={control}
        name="description"
        label={t('merchant.form.description')}
        multiline
      />

      <AppText variant="muted">{t('merchant.form.prepTime')}</AppText>
      <Controller
        control={control}
        name="defaultPrepMinutes"
        render={({ field }) => (
          <View style={styles.chips}>
            {PREP_CHOICES.map((m) => (
              <Chip
                key={m}
                label={t('common.minutes', { count: m })}
                selected={field.value === m}
                onPress={() => field.onChange(m)}
              />
            ))}
          </View>
        )}
      />

      <AppText variant="subtitle">{t('merchant.form.company')}</AppText>
      <AppText variant="muted">{t('merchant.form.companyHint')}</AppText>
      <FormTextField control={control} name="legalName" label={t('merchant.form.legalName')} />
      <FormTextField
        control={control}
        name="siret"
        label={t('merchant.form.siret')}
        keyboardType="number-pad"
        testID="merchant-siret"
      />
      <FormTextField
        control={control}
        name="vatNumber"
        label={t('merchant.form.vatNumber')}
        autoCapitalize="characters"
      />
      <FormTextField
        control={control}
        name="contactEmail"
        label={t('merchant.form.contactEmail')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />

      {error ? <AppText variant="error">{error}</AppText> : null}
      <Button
        testID="merchant-submit"
        title={submitLabel}
        loading={formState.isSubmitting}
        onPress={() => void submit()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
