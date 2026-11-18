/** @vitest-environment node */
import { describe, expect, it } from 'vitest';

import type { ProductionRun } from '@/api';
import {
  canStartRun,
  earliestReadyAt,
  runState,
} from '@/features/production/utils/run-state';

const START = '2026-12-01T05:00:00.000Z';

function run(
  id: number,
  overrides: Partial<ProductionRun> = {},
): ProductionRun {
  return {
    id,
    estimate_revision: 1,
    block_size: 'full',
    quantity: 5,
    mold_capacity: 5,
    planned_start_at: START,
    started_at: null,
    ready_at: null,
    cancelled_at: null,
    expected_ready_at: START,
    ...overrides,
  };
}

describe('run state', () => {
  it('FR22: only the next waiting run of a size can start, and never while one is in the molds', () => {
    const runs = [run(1), run(2)];
    expect(canStartRun(runs[0] as ProductionRun, runs)).toBe(true);
    expect(canStartRun(runs[1] as ProductionRun, runs)).toBe(false);

    const active = [run(1, { started_at: START }), run(2)];
    expect(runState(active[0] as ProductionRun)).toBe('in_molds');
    expect(canStartRun(active[1] as ProductionRun, active)).toBe(false);
  });

  it('a half run is independent of full runs', () => {
    const runs = [
      run(1, { started_at: START }),
      run(2, { block_size: 'half' }),
    ];
    expect(canStartRun(runs[1] as ProductionRun, runs)).toBe(true);
  });

  it('§8.4: earliest ready time is 48 hours after start', () => {
    expect(earliestReadyAt(run(1, { started_at: START }))).toBe(
      '2026-12-03T05:00:00.000Z',
    );
  });
});
