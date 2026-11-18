import type {
  MaterialCalculation,
  MaterialCost,
  MaterialOrder,
  Mix,
  SettingsValues,
} from '@/api/types';
import { CEMENT_BAG_KG, COST_DECIMALS, KG_TO_TON_DECIMALS } from '@/data';
import {
  add,
  formatDecimal,
  fromInteger,
  isZero,
  multiply,
  parseDecimal,
  roundHalfUp,
  shiftLeft,
} from '@/api/mock/rules/decimal';
import type { Decimal } from '@/api/mock/rules/decimal';

/**
 * §8.3 material rules, ported from the backend's `blockcalc/calculation.py`
 * so the mock returns the same figures. Missing inputs are reported together;
 * only the yields for ordered sizes and the inputs for materials the recipe
 * uses are required.
 */
export class MissingCalculationInputs extends Error {
  readonly fields: string[];

  constructor(fields: string[]) {
    super(`Missing required calculation inputs: ${fields.join(', ')}`);
    this.fields = fields;
  }
}

function requireInputs(
  order: MaterialOrder,
  settings: SettingsValues,
  mixes: Mix[],
): Mix {
  const mix = mixes.find((candidate) => candidate.id === order.mix_id);
  if (!mix) throw new MissingCalculationInputs(['mix_id']);

  const required: [string, unknown][] = [];
  if (order.full_quantity) required.push(['full_yield', mix.full_yield]);
  if (order.half_quantity) required.push(['half_yield', mix.half_yield]);
  if (!isZero(parseDecimal(mix.sand_wheelbarrows))) {
    required.push(
      ['sand_kg_per_wheelbarrow', settings.sand_kg_per_wheelbarrow],
      ['sand_price_per_ton', settings.sand_price_per_ton],
    );
  }
  if (!isZero(parseDecimal(mix.stone_wheelbarrows))) {
    required.push(
      ['stone_kg_per_wheelbarrow', settings.stone_kg_per_wheelbarrow],
      ['stone_price_per_ton', settings.stone_price_per_ton],
    );
  }
  if (!isZero(parseDecimal(mix.cement_bags))) {
    required.push(['cement_price_per_ton', settings.cement_price_per_ton]);
  }

  const missing = required
    .filter(([, value]) => value === null)
    .map(([field]) => field);
  if (missing.length > 0) throw new MissingCalculationInputs(missing);
  return mix;
}

/** Round up to whole batches; a zero quantity needs no division. */
export function batchCount(quantity: number, yieldPerBatch: number | null) {
  if (quantity === 0 || yieldPerBatch === null) return 0;
  return Math.ceil(quantity / yieldPerBatch);
}

function materialCost(
  batches: number,
  unitsPerBatch: Decimal,
  kilogramsPerUnit: Decimal | null,
  pricePerTon: string | null,
): MaterialCost {
  if (isZero(unitsPerBatch) || kilogramsPerUnit === null) {
    return { tons: '0', price_per_ton: pricePerTon, cost: '0' };
  }
  const tons = shiftLeft(
    multiply(multiply(fromInteger(batches), unitsPerBatch), kilogramsPerUnit),
    KG_TO_TON_DECIMALS,
  );
  const price =
    pricePerTon === null ? fromInteger(0) : parseDecimal(pricePerTon);
  return {
    tons: formatDecimal(tons),
    price_per_ton: pricePerTon,
    cost: formatDecimal(multiply(tons, price)),
  };
}

const parseNullable = (value: string | null) =>
  value === null ? null : parseDecimal(value);

export function calculateMaterials(
  order: MaterialOrder,
  settings: SettingsValues,
  mixes: Mix[],
): MaterialCalculation {
  const mix = requireInputs(order, settings, mixes);
  const fullBatches = batchCount(order.full_quantity, mix.full_yield);
  const halfBatches = batchCount(order.half_quantity, mix.half_yield);
  const totalBatches = fullBatches + halfBatches;

  const sand = materialCost(
    totalBatches,
    parseDecimal(mix.sand_wheelbarrows),
    parseNullable(settings.sand_kg_per_wheelbarrow),
    settings.sand_price_per_ton,
  );
  const stone = materialCost(
    totalBatches,
    parseDecimal(mix.stone_wheelbarrows),
    parseNullable(settings.stone_kg_per_wheelbarrow),
    settings.stone_price_per_ton,
  );
  const cement = materialCost(
    totalBatches,
    parseDecimal(mix.cement_bags),
    fromInteger(CEMENT_BAG_KG),
    settings.cement_price_per_ton,
  );
  const total = [sand, stone, cement]
    .map((item) => parseDecimal(item.cost))
    .reduce(add);

  return {
    mix_id: mix.id,
    currency: settings.currency,
    full_batches: fullBatches,
    half_batches: halfBatches,
    total_batches: totalBatches,
    full_surplus: fullBatches * (mix.full_yield ?? 0) - order.full_quantity,
    half_surplus: halfBatches * (mix.half_yield ?? 0) - order.half_quantity,
    sand,
    stone,
    cement,
    total_cost: formatDecimal(roundHalfUp(total, COST_DECIMALS), COST_DECIMALS),
  };
}
