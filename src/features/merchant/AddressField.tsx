import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, TextField } from '@/components/ui';
import { radius, spacing, useThemeColors } from '@/theme';

import { type AddressSuggestion, searchAddresses } from './address';

export type AddressValue = Omit<AddressSuggestion, 'label'>;

type Props = {
  value: AddressValue | undefined;
  onChange: (value: AddressValue) => void;
  error?: string;
  /** Par défaut : adresse du commerce. */
  label?: string;
  hint?: string;
  testID?: string;
};

const formatAddress = (a: AddressValue) => `${a.addressLine}, ${a.postalCode} ${a.city}`;

/** Champ adresse avec suggestions : impose une adresse géolocalisée. */
export function AddressField({ value, onChange, error, label, hint, testID }: Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [query, setQuery] = useState(value ? formatAddress(value) : '');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [status, setStatus] = useState<'idle' | 'empty' | 'failed'>('idle');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched || query.trim().length < 4) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchAddresses(query, controller.signal)
        .then((results) => {
          setSuggestions(results);
          setStatus(results.length ? 'idle' : 'empty');
        })
        .catch((e: unknown) => {
          if ((e as Error).name !== 'AbortError') setStatus('failed');
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, touched]);

  const onChangeText = (text: string) => {
    setTouched(true);
    setQuery(text);
    setStatus('idle');
    if (text.trim().length < 4) setSuggestions([]);
  };

  const select = (s: AddressSuggestion) => {
    const { label: _label, ...address } = s;
    onChange(address);
    setQuery(formatAddress(address));
    setSuggestions([]);
    setTouched(false);
  };

  return (
    <View style={styles.container}>
      <TextField
        label={label ?? t('merchant.form.address')}
        testID={testID}
        placeholder={t('merchant.form.addressPlaceholder')}
        value={query}
        onChangeText={onChangeText}
        autoComplete="street-address"
        error={error}
      />
      {suggestions.length > 0 ? (
        <View
          style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          {suggestions.map((s) => (
            <Pressable
              key={s.label}
              accessibilityRole="button"
              onPress={() => select(s)}
              style={({ pressed }) => [styles.suggestion, { opacity: pressed ? 0.6 : 1 }]}>
              <AppText>{s.label}</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
      {status === 'empty' ? (
        <AppText variant="muted">{t('merchant.form.addressNoResult')}</AppText>
      ) : null}
      {status === 'failed' ? (
        <AppText variant="error">{t('merchant.form.addressUnavailable')}</AppText>
      ) : null}
      <AppText variant="muted">
        {value && !touched
          ? t('merchant.form.addressSelected', { label: formatAddress(value) })
          : (hint ?? t('merchant.form.addressHint'))}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  list: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  suggestion: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
