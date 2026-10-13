import { z } from 'zod';

import { isValidSiret, normalizeSiret } from './siret';
import { LEGAL_STATUSES, VEHICLES } from './types';

// Messages = clés i18n.
export const courierSchema = z.object({
  displayName: z.string().trim().min(2, 'courier.validation.nameRequired').max(80),
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d[\d .-]{8,18}\d$/, 'courier.validation.phoneInvalid'),
  legalStatus: z.enum(LEGAL_STATUSES),
  siret: z
    .string()
    .transform(normalizeSiret)
    .refine(isValidSiret, 'courier.validation.siretInvalid'),
  vehicle: z.enum(VEHICLES),
});

export type CourierFormInput = z.input<typeof courierSchema>;
export type CourierFormValues = z.output<typeof courierSchema>;
