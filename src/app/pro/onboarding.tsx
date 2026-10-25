import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Screen } from '@/components/ui';
import { signOut } from '@/features/auth/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { ProVerificationScreen, useProVerification } from '@/features/auth/ProVerification';
import { createMerchant } from '@/features/merchant/api';
import { merchantKeys } from '@/features/merchant/hooks';
import { MerchantForm } from '@/features/merchant/MerchantForm';

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { verified } = useProVerification();

  // E-mail confirmé avant de créer le commerce (règle appliquée en base).
  if (!verified) {
    return <ProVerificationScreen exitLabel={t('account.signOut')} onExit={() => void signOut()} />;
  }

  return (
    <Screen scroll>
      <AppText variant="title">{t('merchant.noMerchantTitle')}</AppText>
      <AppText variant="muted">{t('merchant.noMerchantBody')}</AppText>
      <MerchantForm
        submitLabel={t('merchant.form.create')}
        onSubmit={async (values) => {
          await createMerchant(values);
          // La garde de pro/_layout bascule alors vers le tableau de bord.
          await queryClient.invalidateQueries({ queryKey: merchantKeys.mine(session?.user.id) });
        }}
      />
      {/* Pas d'onglets tant que le commerce n'existe pas : on garde une sortie. */}
      <Button variant="ghost" title={t('account.signOut')} onPress={() => void signOut()} />
    </Screen>
  );
}
