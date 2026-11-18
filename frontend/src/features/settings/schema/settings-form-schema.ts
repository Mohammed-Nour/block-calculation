import { z } from 'zod';

/** §8.2 rules for the settings form, checked before anything is sent. */

const DECIMAL = /^\d+(?:\.\d+)?$/;

const price = z
  .string()
  .trim()
  .refine((value) => value === '' || DECIMAL.test(value), {
    message: 'Enter a price of 0 or more, e.g. 10.50',
  });

const weight = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || (DECIMAL.test(value) && Number(value) > 0),
    {
      message: 'Enter a weight greater than 0, e.g. 100',
    },
  );

const moldCount = z
  .string()
  .trim()
  .regex(/^\d+$/, { message: 'Enter a whole number of 0 or more' });

const yieldCount = z
  .string()
  .trim()
  .refine((value) => value === '' || /^[1-9]\d*$/.test(value), {
    message: 'Enter a whole number greater than 0',
  });

export const settingsFormSchema = z.object({
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, { message: 'Enter a three-letter code, e.g. RUB' }),
  sand_price_per_ton: price,
  stone_price_per_ton: price,
  cement_price_per_ton: price,
  full_molds: moldCount,
  half_molds: moldCount,
  sand_kg_per_wheelbarrow: weight,
  stone_kg_per_wheelbarrow: weight,
  mix_yields: z.array(
    z.object({
      id: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
      full_yield: yieldCount,
      half_yield: yieldCount,
    }),
  ),
});
