import { type Control, Controller, type FieldPath, type FieldValues } from 'react-hook-form';
import type { TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TextField } from '@/components/ui';

type Props<T extends FieldValues> = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
};

/** Champ texte relié à react-hook-form ; les messages d'erreur zod sont des clés i18n. */
export function FormTextField<T extends FieldValues>({
  control,
  name,
  label,
  ...inputProps
}: Props<T>) {
  const { t } = useTranslation();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          label={label}
          value={field.value ?? ''}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message ? t(fieldState.error.message as never) : undefined}
          {...inputProps}
        />
      )}
    />
  );
}
