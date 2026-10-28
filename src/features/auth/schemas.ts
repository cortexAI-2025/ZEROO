import { z } from 'zod';

import { toE164 } from './phone';

// Les messages sont des clés i18n, traduites à l'affichage.
const email = z.string().trim().toLowerCase().pipe(z.email('auth.errors.emailInvalid'));

// Doit rester aligné avec supabase/config.toml (minimum_password_length, password_requirements).
const password = z
  .string()
  .min(8, 'auth.errors.passwordTooShort')
  .regex(/[A-Za-z]/, 'auth.errors.passwordTooShort')
  .regex(/\d/, 'auth.errors.passwordTooShort');

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'auth.errors.passwordTooShort'),
});

export const signUpSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'auth.errors.firstNameRequired')
    .max(80, 'auth.errors.nameTooLong'),
  lastName: z
    .string()
    .trim()
    .min(1, 'auth.errors.lastNameRequired')
    .max(80, 'auth.errors.nameTooLong'),
  addressLine: z
    .string()
    .trim()
    .min(5, 'auth.errors.addressRequired')
    .max(240, 'auth.errors.addressRequired'),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'auth.errors.postalCodeInvalid'),
  city: z.string().trim().min(2, 'auth.errors.cityRequired').max(100, 'auth.errors.cityRequired'),
  phone: z
    .string()
    .trim()
    .refine((value) => toE164(value) !== null, 'auth.errors.phoneRequired')
    .transform((value) => toE164(value)!),
  email,
  password,
});

export const resetRequestSchema = z.object({ email });

export const newPasswordSchema = z.object({ password });

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type ResetRequestValues = z.infer<typeof resetRequestSchema>;
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;
