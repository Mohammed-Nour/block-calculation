import { z } from 'zod';

import { PROJECT_NAME_MAX_LENGTH } from '@/data';

const quantity = z
  .string()
  .trim()
  .regex(/^\d+$/, { message: 'Enter a whole number of 0 or more' });

/** §8.2 rules for a project draft. A draft may have no mix yet. */
export const projectFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { message: 'Enter a project name' })
      .max(PROJECT_NAME_MAX_LENGTH, {
        message: `Use at most ${PROJECT_NAME_MAX_LENGTH} characters`,
      }),
    requested_start_at: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), {
        message: 'Enter the date and time production should start',
      }),
    full_quantity: quantity,
    half_quantity: quantity,
    mix_id: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
      .nullable(),
  })
  .refine(
    (values) =>
      !/^\d+$/.test(values.full_quantity) ||
      !/^\d+$/.test(values.half_quantity) ||
      Number(values.full_quantity) + Number(values.half_quantity) > 0,
    {
      message: 'Order at least one full or half block',
      path: ['full_quantity'],
    },
  );
