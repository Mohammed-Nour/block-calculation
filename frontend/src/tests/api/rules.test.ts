/** @vitest-environment node */
import { describe, expect, it } from 'vitest';

import {
  formatDecimal,
  parseDecimal,
  roundHalfUp,
} from '@/api/mock/rules/decimal';
import {
  MissingCalculationInputs,
  calculateMaterials,
} from '@/api/mock/rules/materials';
import {
  forecastOrder,
  forecastRuns,
  hoursBetween,
  planRuns,
  withExpectedTimes,
} from '@/api/mock/rules/production';
import { emptyState } from '@/api/mock/db';
import type { Mix, SettingsValues } from '@/api/types';

/** §8.5 worked-example inputs. */
const SETTINGS: SettingsValues = {
  currency: 'RUB',
  sand_price_per_ton: '10',
  stone_price_per_ton: '20',
  cement_price_per_ton: '100',
  full_molds: 50,
  half_molds: 15,
  sand_kg_per_wheelbarrow: '100',
  stone_kg_per_wheelbarrow: '120',
};
const MIXES: Mix[] = emptyState().mixes.map((mix) =>
  mix.id === 1
    ? { ...mix, full_yield: 22, half_yield: 40 }
    : { ...mix, full_yield: 35, half_yield: 60 },
);
const START = '2026-12-01T08:00:00+03:00';

describe('decimal', () => {
  it('rounds half up on the final cost only', () => {
    expect(formatDecimal(roundHalfUp(parseDecimal('0.005'), 2), 2)).toBe(
      '0.01',
    );
    expect(formatDecimal(roundHalfUp(parseDecimal('691.2'), 2), 2)).toBe(
      '691.20',
    );
  });
});

describe('material calculation (§8.3)', () => {
  it('AT03: worked example gives 54 batches and 691.20 RUB', () => {
    const result = calculateMaterials(
      { full_quantity: 1700, half_quantity: 300, mix_id: 2 },
      SETTINGS,
      MIXES,
    );
    expect(result).toMatchObject({
      full_batches: 49,
      half_batches: 5,
      total_batches: 54,
      full_surplus: 15,
      half_surplus: 0,
      sand: { tons: '16.2', cost: '162' },
      stone: { tons: '12.96', cost: '259.2' },
      cement: { tons: '2.7', cost: '270' },
      total_cost: '691.20',
    });
  });

  it('AT04: Mix 1 with yields 22 and 40 gives 86 batches and 688.00 RUB', () => {
    const result = calculateMaterials(
      { full_quantity: 1700, half_quantity: 300, mix_id: 1 },
      {
        ...SETTINGS,
        stone_price_per_ton: null,
        stone_kg_per_wheelbarrow: null,
      },
      MIXES,
    );
    expect(result.total_batches).toBe(86);
    expect(result.stone.tons).toBe('0');
    expect(result.total_cost).toBe('688.00');
  });

  it('AT02: no mix means no cost', () => {
    expect(() =>
      calculateMaterials(
        { full_quantity: 10, half_quantity: 0, mix_id: null },
        SETTINGS,
        MIXES,
      ),
    ).toThrow(MissingCalculationInputs);
  });

  it('SC02: reports every missing input at once, only for what the order uses', () => {
    const missing = (() => {
      try {
        calculateMaterials(
          { full_quantity: 10, half_quantity: 0, mix_id: 2 },
          {
            ...SETTINGS,
            sand_price_per_ton: null,
            stone_kg_per_wheelbarrow: null,
          },
          MIXES.map((mix) => ({ ...mix, full_yield: null, half_yield: null })),
        );
      } catch (error) {
        return (error as MissingCalculationInputs).fields;
      }
      return [];
    })();
    expect(missing).toEqual([
      'full_yield',
      'sand_price_per_ton',
      'stone_kg_per_wheelbarrow',
    ]);
  });
});

describe('completion forecast (§8.4)', () => {
  it('leaves completion unavailable when saved runs cover only part of an order', () => {
    const runs = withExpectedTimes(
      planRuns(START, { full: 120, half: 0 }, { full: 50, half: 0 }, 1).map(
        (run, index) => ({
          ...run,
          id: index + 1,
          cancelled_at: index > 0 ? START : null,
        }),
      ),
    );
    const forecast = forecastRuns(
      START,
      runs,
      { full: 120, half: 0 },
      { full: 50, half: 0 },
    );
    expect(forecast.expected_ready_at).toBeNull();
    expect(forecast.duration_hours).toBeNull();
    expect(forecast.untimed_sizes).toEqual(['full']);
  });
  it('AT03: 34 full and 20 half cycles take 1632 hours', () => {
    const forecast = forecastOrder(
      START,
      { full: 1700, half: 300 },
      { full: 50, half: 15 },
    );
    expect(forecast.full.cycles).toBe(34);
    expect(forecast.half.cycles).toBe(20);
    expect(forecast.duration_hours).toBe(1632);
  });

  it('AT06: 51 full blocks with 50 molds take 96 hours', () => {
    expect(
      forecastOrder(START, { full: 51, half: 0 }, { full: 50, half: 0 })
        .duration_hours,
    ).toBe(96);
  });

  it('AT06 / SC03: positive demand with no molds has no forecast', () => {
    const forecast = forecastOrder(
      START,
      { full: 0, half: 5 },
      { full: 50, half: 0 },
    );
    expect(forecast.expected_ready_at).toBeNull();
    expect(forecast.untimed_sizes).toEqual(['half']);
  });

  it('AT07: each one-block project is ready 48 hours after its own start', () => {
    const other = '2026-12-03T08:00:00+03:00';
    for (const start of [START, other]) {
      const forecast = forecastOrder(
        start,
        { full: 1, half: 0 },
        { full: 1, half: 0 },
      );
      expect(forecast.duration_hours).toBe(48);
    }
  });

  it('AT08: a run confirmed at hour 60 moves the next run to hour 108', () => {
    const runs = planRuns(
      START,
      { full: 2, half: 0 },
      { full: 1, half: 0 },
      1,
    ).map((run, index) => ({ ...run, id: index + 1 }));
    const [first, second] = runs;
    if (!first || !second) throw new Error('expected two runs');
    first.started_at = START;
    first.ready_at = new Date(Date.parse(START) + 60 * 3_600_000).toISOString();
    const timed = withExpectedTimes(runs);
    expect(hoursBetween(START, timed[1]?.expected_ready_at ?? '')).toBe(108);
  });
});
