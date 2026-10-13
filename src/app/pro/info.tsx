import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui';
import { formValuesToPatch } from '@/features/merchant/api';
import { useCurrentMerchant, useUpdateMerchant } from '@/features/merchant/hooks';
import { MerchantForm, merchantToFormValues } from '@/features/merchant/MerchantForm';
import { photoPaths } from '@/features/photos/api';
import { PhotoField } from '@/features/photos/PhotoField';

export default function MerchantInfoScreen() {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const update = useUpdateMerchant(merchant.id);

  return (
    <Screen scroll>
      <PhotoField
        testID="merchant-photo"
        label={t('photos.merchant')}
        url={merchant.photo_url}
        path={photoPaths.merchant(merchant.id)}
        shape="wide"
        onSaved={(url) => update.mutateAsync({ photo_url: url })}
      />
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
