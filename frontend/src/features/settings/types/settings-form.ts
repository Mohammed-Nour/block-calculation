import type { Material, MixId } from '@/api';

/** Settings as the form edits them: every input is a string. */
export interface SettingsFormValues {
  currency: string;
  sand_price_per_ton: string;
  stone_price_per_ton: string;
  cement_price_per_ton: string;
  full_molds: string;
  half_molds: string;
  sand_kg_per_wheelbarrow: string;
  stone_kg_per_wheelbarrow: string;
  mix_yields: { id: MixId; full_yield: string; half_yield: string }[];
}

export type SettingsFieldErrors = Partial<Record<string, string>>;

export type PriceField = `${Material}_price_per_ton`;
