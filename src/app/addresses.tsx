import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, Chip, QueryState, Screen, TextField } from '@/components/ui';
import { useAddressActions, useAddresses } from '@/features/account/hooks';
import { AddressField, type AddressValue } from '@/features/merchant/AddressField';
import { confirmAsync } from '@/lib/confirm';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme';

const LABELS = ['home', 'work', 'other'] as const;

/** Adresses de livraison enregistrées : ajout, adresse par défaut, suppression. */
export default function AddressesScreen() {
  const { t } = useTranslation();
  const addresses = useAddresses();
  const actions = useAddressActions();
  const [address, setAddress] = useState<AddressValue | undefined>();
  const [label, setLabel] = useState<(typeof LABELS)[number]>('home');
  const [instructions, setInstructions] = useState('');
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const perform = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(t(errorKey(e)));
      return false;
    }
  };

  const add = async () => {
    if (!address) return;
    const ok = await perform(() =>
      actions.add.mutateAsync({
        label: t(`client.addresses.labels.${label}`),
        address_line: address.addressLine,
        postal_code: address.postalCode,
        city: address.city,
        latitude: address.latitude,
        longitude: address.longitude,
        instructions: instructions.trim() || null,
        is_default: (addresses.data ?? []).length === 0,
      }),
    );
    if (ok) {
      setAddress(undefined);
      setInstructions('');
      setFormKey((k) => k + 1); // vide le champ adresse
    }
  };

  const remove = async (id: string) => {
    const confirmed = await confirmAsync({
      title: t('client.addresses.deleteTitle'),
      message: t('client.addresses.deleteBody'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (confirmed) await perform(() => actions.remove.mutateAsync(id));
  };

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('client.addresses.title') }} />
      {!addresses.data ? (
        <QueryState error={addresses.error} onRetry={() => void addresses.refetch()} />
      ) : (
        addresses.data.map((a) => (
          <Card key={a.id} testID={`address-${a.label}`}>
            <View style={styles.row}>
              <AppText variant="subtitle" style={styles.flex}>
                {a.label}
              </AppText>
              {a.is_default ? <Badge label={t('client.addresses.default')} tone="success" /> : null}
            </View>
            <AppText>
              {a.address_line}, {a.postal_code} {a.city}
            </AppText>
            {a.instructions ? <AppText variant="muted">{a.instructions}</AppText> : null}
            <View style={styles.row}>
              {!a.is_default ? (
                <Button
                  variant="ghost"
                  title={t('client.addresses.makeDefault')}
                  onPress={() => void perform(() => actions.setDefault.mutateAsync(a.id))}
                />
              ) : null}
              <Button
                variant="ghost"
                title={t('common.delete')}
                onPress={() => void remove(a.id)}
              />
            </View>
          </Card>
        ))
      )}

      <Card>
        <AppText variant="subtitle">{t('client.addresses.add')}</AppText>
        <View style={styles.chips}>
          {LABELS.map((l) => (
            <Chip
              key={l}
              label={t(`client.addresses.labels.${l}`)}
              selected={label === l}
              onPress={() => setLabel(l)}
            />
          ))}
        </View>
        <AddressField
          key={formKey}
          value={address}
          onChange={setAddress}
          label={t('client.addresses.address')}
          testID="new-address"
        />
        <TextField
          label={t('client.addresses.instructions')}
          value={instructions}
          onChangeText={setInstructions}
          maxLength={200}
        />
        <Button
          testID="add-address"
          title={t('client.addresses.save')}
          disabled={!address}
          loading={actions.add.isPending}
          onPress={() => void add()}
        />
      </Card>
      {error ? <AppText variant="error">{error}</AppText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
