import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { spacing, useThemeColors } from '@/theme';

import { signOut } from './api';
import { useAuth } from './AuthProvider';
import { authErrorKey } from './errors';
import { formatPhone, toE164 } from './phone';
import { proVerification } from './status';
import { resendConfirmationEmail, sendPhoneCode, verifyPhoneCode } from './verification';

/** Statut de vérification du compte connecté (e-mail + téléphone). */
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

function PhoneStep() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { phoneVerified, phone } = proVerification(session?.user);
  const [input, setInput] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (phoneVerified) {
    return (
      <Card>
        <StepTitle done label={t('auth.proVerification.phoneStep')} />
        <AppText variant="muted">
          {t('auth.proVerification.phoneDone', { phone: formatPhone(phone) })}
        </AppText>
      </Card>
    );
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const send = (target: string | null) =>
    run(async () => {
      if (!target) {
        setError(t('auth.errors.phoneInvalid'));
        return;
      }
      await sendPhoneCode(target);
      setSentTo(target);
      setCode('');
    });

  const verify = () =>
    run(async () => {
      const token = code.replace(/\s/g, '');
      if (!sentTo || !/^\d{6}$/.test(token)) {
        setError(t('auth.errors.codeInvalid'));
        return;
      }
      await verifyPhoneCode(sentTo, token);
    });

  return (
    <Card>
      <StepTitle done={false} label={t('auth.proVerification.phoneStep')} />
      {sentTo ? (
        <>
          <AppText variant="muted">
            {t('auth.proVerification.codeSent', { phone: formatPhone(sentTo) })}
          </AppText>
          <TextField
            testID="pro-verification-code"
            label={t('auth.proVerification.codeLabel')}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={7}
            onSubmitEditing={() => void verify()}
          />
          {error ? <AppText variant="error">{error}</AppText> : null}
          <Button
            testID="pro-verification-verify"
            title={t('auth.proVerification.verify')}
            loading={busy}
            onPress={() => void verify()}
          />
          <View style={styles.row}>
            <Button
              variant="ghost"
              title={t('auth.proVerification.resendCode')}
              disabled={busy}
              onPress={() => void send(sentTo)}
            />
            <Button
              variant="ghost"
              title={t('auth.proVerification.changePhone')}
              disabled={busy}
              onPress={() => {
                setSentTo(null);
                setError(null);
              }}
            />
          </View>
        </>
      ) : (
        <>
          <TextField
            testID="pro-verification-phone"
            label={t('auth.proVerification.phoneLabel')}
            value={input}
            onChangeText={setInput}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="06 12 34 56 78"
            onSubmitEditing={() => void send(toE164(input))}
          />
          <AppText variant="muted">{t('auth.proVerification.phoneHint')}</AppText>
          {error ? <AppText variant="error">{error}</AppText> : null}
          <Button
            testID="pro-verification-send"
            title={t('auth.proVerification.sendCode')}
            loading={busy}
            onPress={() => void send(toE164(input))}
          />
        </>
      )}
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
      <PhoneStep />
      <Button variant="ghost" title={exitLabel} onPress={onExit} />
      <Button variant="ghost" title={t('account.signOut')} onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
});
