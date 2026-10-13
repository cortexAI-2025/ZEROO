import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui';
import { formValuesToPatch } from '@/features/merchant/api';
import { useCurrentMerchant, useUpdateMerchant } from '@/features/merchant/hooks';
import { MerchantForm, merchantToFormValues } from '@/features/merchant/MerchantForm';

export default function MerchantInfoScreen() {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const update = useUpdateMerchant(merchant.id);

  return (
    <Screen scroll>
      <MerchantForm
        initialValues={merchantToFormValues(merchant)}
        submitLabel={t('common.save')}
        onSubmit={async (values) => {
          await update.mutateAsync(formValuesToPatch(values));
          router.back();
        }}
      />
    </Screen>
  );
}
