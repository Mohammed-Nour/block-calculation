import type { ProductionRun } from '@/api';
import { CYCLE_HOURS, MS_PER_HOUR } from '@/data';

import type { RunState } from '@/features/production/types/run-state';

export function runState(run: ProductionRun): RunState {
  if (run.cancelled_at !== null) return 'cancelled';
  if (run.ready_at !== null) return 'ready';
  if (run.started_at !== null) return 'in_molds';
  return 'waiting';
}

/**
 * Only the next waiting run of a size can start, and only when no run of that
 * size is in the molds, so a run never uses more molds than saved (FR22).
 */
export function canStartRun(run: ProductionRun, runs: ProductionRun[]) {
  if (runState(run) !== 'waiting') return false;
  const sameSize = runs.filter((other) => other.block_size === run.block_size);
  if (sameSize.some((other) => runState(other) === 'in_molds')) return false;
  return sameSize.find((other) => runState(other) === 'waiting')?.id === run.id;
}

/** §8.4: a run can be confirmed ready only 48 hours after it started. */
export function earliestReadyAt(run: ProductionRun) {
  if (run.started_at === null) return null;
  return new Date(
    Date.parse(run.started_at) + CYCLE_HOURS * MS_PER_HOUR,
  ).toISOString();
}
