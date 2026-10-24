import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useThemeColors } from '@/theme';

import { signOut } from './api';
import { useAuth } from './AuthProvider';
import { authErrorKey } from './errors';
import { proVerification } from './status';
import { resendConfirmationEmail } from './verification';

/** Statut de vérification du compte connecté (e-mail uniquement). */
export function useProVerification() {
  const { session } = useAuth();
  return proVerification(session?.user);
}

function StepTitle({ done, label }: { done: boolean; label: string }) {
  const colors = useThemeColors();
  return (
    <AppText variant="subtitle" style={done ? { color: colors.success } : undefined}>
      {done ? '✓ ' : ''}
      {label}
    </AppText>
  );
}

function EmailStep() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { emailConfirmed } = proVerification(session?.user);
  const email = session?.user.email ?? '';
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  if (emailConfirmed) {
    return (
      <Card>
        <StepTitle done label={t('auth.proVerification.emailStep')} />
        <AppText variant="muted">{t('auth.proVerification.emailDone', { email })}</AppText>
      </Card>
    );
  }

  const run = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (success) setMessage({ text: success, error: false });
    } catch (e) {
      setMessage({ text: t(authErrorKey(e)), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <StepTitle done={false} label={t('auth.proVerification.emailStep')} />
      <AppText>{t('auth.proVerification.emailPending', { email })}</AppText>
      {message ? (
        <AppText variant={message.error ? 'error' : 'muted'}>{message.text}</AppText>
      ) : null}
      <Button
        variant="secondary"
        title={t('auth.proVerification.refresh')}
        loading={busy}
        onPress={() => void run(() => supabase.auth.refreshSession())}
      />
      <Button
        variant="ghost"
        title={t('auth.proVerification.resendEmail')}
        disabled={busy}
        onPress={() =>
          void run(() => resendConfirmationEmail(email), t('auth.proVerification.emailResent'))
        }
      />
    </Card>
  );
}

/**
 * Écran affiché à un commerçant ou un livreur tant que son compte n'est pas vérifié.
 * `onExit` : retour à l'espace client (le compte reste utilisable pour commander).
 */
export function ProVerificationScreen({
  onExit,
  exitLabel,
}: {
  onExit: () => void;
  exitLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <Screen scroll>
      <AppText variant="title">{t('auth.proVerification.title')}</AppText>
      <AppText variant="muted">{t('auth.proVerification.intro')}</AppText>
      <EmailStep />
      <Button variant="ghost" title={exitLabel} onPress={onExit} />
      <Button variant="ghost" title={t('account.signOut')} onPress={() => void signOut()} />
    </Screen>
  );
}
