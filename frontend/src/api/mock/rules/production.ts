import type {
  BlockSize,
  Collection,
  Forecast,
  ProductionRun,
  ProjectStatus,
  SizeBalance,
  SizeForecast,
  Timestamp,
} from '@/api/types';
import { BLOCK_SIZE_ORDER, CYCLE_HOURS, MS_PER_HOUR } from '@/data';

/** §8.4 production rules: cycles, runs, forecasts and status. */

const CYCLE_MS = CYCLE_HOURS * MS_PER_HOUR;

export function addCycles(start: Timestamp, cycles: number): Timestamp {
  return new Date(Date.parse(start) + cycles * CYCLE_MS).toISOString();
}

export function hoursBetween(from: Timestamp, to: Timestamp) {
  return (Date.parse(to) - Date.parse(from)) / MS_PER_HOUR;
}

/** Cycles for one size; null when there is demand but no molds (SC03). */
export function cycleCount(quantity: number, molds: number) {
  if (quantity === 0) return 0;
  if (molds === 0) return null;
  return Math.ceil(quantity / molds);
}

export type Quantities = Record<BlockSize, number>;

/**
 * Forecast for an unplanned order (§8.4): the larger cycle count × 48 hours
 * from the start. Full and half molds work in parallel, and the forecast is
 * independent of other projects (FR21).
 */
export function forecastOrder(
  start: Timestamp,
  quantities: Quantities,
  molds: Quantities,
): Forecast {
  const sizes = Object.fromEntries(
    BLOCK_SIZE_ORDER.map((size) => {
      const cycles = cycleCount(quantities[size], molds[size]);
      const forecast: SizeForecast = {
        quantity: quantities[size],
        molds: molds[size],
        cycles: cycles ?? 0,
        expected_ready_at: cycles === null ? null : addCycles(start, cycles),
      };
      return [size, forecast];
    }),
  ) as Record<BlockSize, SizeForecast>;
  return combine(start, sizes);
}

function combine(
  start: Timestamp,
  sizes: Record<BlockSize, SizeForecast>,
): Forecast {
  const untimed = BLOCK_SIZE_ORDER.filter(
    (size) =>
      sizes[size].quantity > 0 && sizes[size].expected_ready_at === null,
  );
  const readyTimes = BLOCK_SIZE_ORDER.map(
    (size) => sizes[size].expected_ready_at,
  ).filter((time): time is Timestamp => time !== null);
  const latest =
    untimed.length > 0 || readyTimes.length === 0
      ? null
      : readyTimes.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
  return {
    full: sizes.full,
    half: sizes.half,
    duration_hours: latest === null ? null : hoursBetween(start, latest),
    expected_ready_at: latest,
    untimed_sizes: untimed,
  };
}

export type PlannedRun = Omit<ProductionRun, 'id' | 'expected_ready_at'>;

/** Split each size into runs no larger than its mold count, one per cycle. */
export function planRuns(
  start: Timestamp,
  quantities: Quantities,
  molds: Quantities,
  estimateRevision: number,
): PlannedRun[] {
  return BLOCK_SIZE_ORDER.flatMap((size) => {
    const runs: PlannedRun[] = [];
    let remaining = quantities[size];
    for (let cycle = 0; remaining > 0; cycle += 1) {
      const quantity = Math.min(molds[size], remaining);
      runs.push({
        estimate_revision: estimateRevision,
        block_size: size,
        quantity,
        mold_capacity: molds[size],
        planned_start_at: addCycles(start, cycle),
        started_at: null,
        ready_at: null,
        cancelled_at: null,
      });
      remaining -= quantity;
    }
    return runs;
  });
}

/**
 * Expected ready time of each run. Runs of one size follow each other, so a
 * run that is not started yet begins when the previous one is (or is expected
 * to be) ready. A delay therefore moves only this project's later runs (FR24).
 * Pass `now` so an overdue active run pushes the forecast forward (SC05).
 */
export function withExpectedTimes(
  runs: Omit<ProductionRun, 'expected_ready_at'>[],
  now?: Timestamp,
): ProductionRun[] {
  const previousEnd: Partial<Record<BlockSize, Timestamp>> = {};
  return runs.map((run) => {
    if (run.cancelled_at !== null) {
      return { ...run, expected_ready_at: run.planned_start_at };
    }
    const earliest = previousEnd[run.block_size];
    const start =
      run.started_at ??
      (earliest && Date.parse(earliest) > Date.parse(run.planned_start_at)
        ? earliest
        : run.planned_start_at);
    let expected = run.ready_at ?? addCycles(start, 1);
    // SC05: a started run that is overdue stays active, so it is expected no
    // earlier than now and the later runs move with it.
    if (
      run.ready_at === null &&
      run.started_at !== null &&
      now !== undefined &&
      Date.parse(now) > Date.parse(expected)
    ) {
      expected = now;
    }
    previousEnd[run.block_size] = expected;
    return { ...run, expected_ready_at: expected };
  });
}

/** Forecast for a planned project, from its runs' expected times. */
export function forecastRuns(
  start: Timestamp,
  runs: ProductionRun[],
  quantities: Quantities,
  molds: Quantities,
): Forecast {
  const sizes = Object.fromEntries(
    BLOCK_SIZE_ORDER.map((size) => {
      const active = runs.filter(
        (run) => run.block_size === size && run.cancelled_at === null,
      );
      const last = active.at(-1);
      const forecast: SizeForecast = {
        quantity: quantities[size],
        molds: molds[size],
        cycles: active.length,
        expected_ready_at: last ? last.expected_ready_at : null,
      };
      return [size, forecast];
    }),
  ) as Record<BlockSize, SizeForecast>;
  return combine(start, sizes);
}

export function balances(
  quantities: Quantities,
  runs: ProductionRun[],
  collections: Collection[],
): Record<BlockSize, SizeBalance> {
  const entries = BLOCK_SIZE_ORDER.map((size) => {
    const ready = runs
      .filter((run) => run.block_size === size && run.ready_at !== null)
      .reduce((sum, run) => sum + run.quantity, 0);
    const collected = collections.reduce(
      (sum, item) =>
        sum + (size === 'full' ? item.full_quantity : item.half_quantity),
      0,
    );
    return [size, { requested: quantities[size], ready, collected }];
  });
  return Object.fromEntries(entries) as Record<BlockSize, SizeBalance>;
}

/** §8.4 status values, derived from what has actually happened. */
export function deriveStatus(
  cancelled: boolean,
  runs: ProductionRun[],
  balance: Record<BlockSize, SizeBalance>,
): ProjectStatus {
  const sizes = BLOCK_SIZE_ORDER.map((size) => balance[size]);
  if (sizes.every((size) => size.collected >= size.requested)) {
    return 'collected';
  }
  if (cancelled) return 'cancelled';
  if (runs.length === 0) return 'draft';
  if (sizes.every((size) => size.ready >= size.requested)) return 'ready';
  if (sizes.some((size) => size.ready > 0)) return 'partially_ready';
  if (runs.some((run) => run.started_at !== null)) return 'in_production';
  return 'planned';
}

/** FR18: quantities and mix lock once production starts. */
export function isOrderLocked(status: ProjectStatus) {
  return status !== 'draft' && status !== 'planned';
}
