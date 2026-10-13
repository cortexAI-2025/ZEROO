import { z } from 'zod';

import { MERCHANT_CATEGORIES } from './types';

// Messages = clés i18n.
export const merchantSchema = z.object({
  name: z.string().trim().min(2, 'merchant.errors.nameRequired').max(80),
  category: z.enum(MERCHANT_CATEGORIES),
  description: z.string().trim().max(500).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?\d[\d .-]{7,18})?$/, 'merchant.errors.phoneInvalid')
    .optional(),
  defaultPrepMinutes: z.number().int().min(1).max(120),
  address: z.object(
    {
      addressLine: z.string().min(3),
      postalCode: z.string().regex(/^\d{5}$/),
      city: z.string().min(1),
      latitude: z.number(),
      longitude: z.number(),
    },
    { error: 'merchant.errors.addressRequired' },
  ),
});

export type MerchantFormValues = z.infer<typeof merchantSchema>;
