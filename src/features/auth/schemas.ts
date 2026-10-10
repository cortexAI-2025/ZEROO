import { z } from 'zod';

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
  displayName: z.string().trim().max(80).optional(),
  email,
  password,
});

export const resetRequestSchema = z.object({ email });

export const newPasswordSchema = z.object({ password });

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type ResetRequestValues = z.infer<typeof resetRequestSchema>;
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;
