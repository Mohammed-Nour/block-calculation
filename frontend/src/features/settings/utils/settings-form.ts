import type { Material, Settings, SettingsUpdate } from '@/api';
import { PRICE_FIELDS } from '@/features/settings/data/settings-fields.config';
import { settingsFormSchema } from '@/features/settings/schema/settings-form-schema';
import type {
  SettingsFieldErrors,
  SettingsFormValues,
} from '@/features/settings/types/settings-form';

const text = (value: string | number | null) =>
  value === null ? '' : String(value);
const nullable = (value: string) => (value.trim() === '' ? null : value.trim());
const nullableCount = (value: string) =>
  value.trim() === '' ? null : Number(value);

export function toFormValues(settings: Settings): SettingsFormValues {
  return {
    currency: settings.currency,
    sand_price_per_ton: text(settings.sand_price_per_ton),
    stone_price_per_ton: text(settings.stone_price_per_ton),
    cement_price_per_ton: text(settings.cement_price_per_ton),
    full_molds: text(settings.full_molds),
    half_molds: text(settings.half_molds),
    sand_kg_per_wheelbarrow: text(settings.sand_kg_per_wheelbarrow),
    stone_kg_per_wheelbarrow: text(settings.stone_kg_per_wheelbarrow),
    mix_yields: settings.mixes.map((mix) => ({
      id: mix.id,
      full_yield: text(mix.full_yield),
      half_yield: text(mix.half_yield),
    })),
  };
}

/** Field errors keyed like the API's `loc` paths, e.g. `mix_yields.0.full_yield`. */
export function validateSettingsForm(
  values: SettingsFormValues,
): SettingsFieldErrors {
  const result = settingsFormSchema.safeParse(values);
  if (result.success) return {};
  const errors: SettingsFieldErrors = {};
  for (const issue of result.error.issues) {
    errors[issue.path.join('.')] ??= issue.message;
  }
  return errors;
}

export function toSettingsUpdate(
  values: SettingsFormValues,
  version: number,
  confirmedZeroPrices: Material[],
): SettingsUpdate {
  return {
    version,
    currency: values.currency.trim().toUpperCase(),
    sand_price_per_ton: nullable(values.sand_price_per_ton),
    stone_price_per_ton: nullable(values.stone_price_per_ton),
    cement_price_per_ton: nullable(values.cement_price_per_ton),
    full_molds: Number(values.full_molds),
    half_molds: Number(values.half_molds),
    sand_kg_per_wheelbarrow: nullable(values.sand_kg_per_wheelbarrow),
    stone_kg_per_wheelbarrow: nullable(values.stone_kg_per_wheelbarrow),
    mix_yields: values.mix_yields.map((mix) => ({
      id: mix.id,
      full_yield: nullableCount(mix.full_yield),
      half_yield: nullableCount(mix.half_yield),
    })),
    confirmed_zero_prices: confirmedZeroPrices,
  };
}

/** §8.2: prices that become zero in this save and need confirmation. */
export function newZeroPrices(
  values: SettingsFormValues,
  settings: Settings,
): Material[] {
  return PRICE_FIELDS.filter(({ field }) => {
    const next = values[field].trim();
    const current = settings[field];
    const isZero = next !== '' && Number(next) === 0;
    return isZero && !(current !== null && Number(current) === 0);
  }).map(({ material }) => material);
}

/** What is still missing before any cost can be calculated (FR14). */
export function missingForCosting(settings: Settings): string[] {
  const missing: string[] = [];
  if (settings.sand_price_per_ton === null) missing.push('sand price');
  if (settings.cement_price_per_ton === null) missing.push('cement price');
  if (settings.sand_kg_per_wheelbarrow === null) missing.push('sand weight');
  if (settings.stone_price_per_ton === null)
    missing.push('stone price (not needed for Mix 1)');
  if (settings.stone_kg_per_wheelbarrow === null)
    missing.push('stone weight (not needed for Mix 1)');
  if (settings.full_molds === 0 && settings.half_molds === 0)
    missing.push('mold counts');
  const noYields = settings.mixes.filter(
    (mix) => mix.full_yield === null && mix.half_yield === null,
  );
  if (noYields.length > 0) {
    missing.push(`yields for ${noYields.map((mix) => mix.name).join(', ')}`);
  }
  return missing;
}

export function recipeSummary(mix: Settings['mixes'][number]) {
  return `${mix.sand_wheelbarrows} sand · ${mix.stone_wheelbarrows} stone wheelbarrows · ${mix.cement_bags} cement bag`;
}
