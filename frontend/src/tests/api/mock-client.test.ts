/** @vitest-environment node */
import { beforeEach, describe, expect, it } from 'vitest';

import { isApiError } from '@/api/errors';
import type { BlockCalcApi } from '@/api/client';
import { memoryStore } from '@/api/mock/db';
import { createMockApi } from '@/api/mock/mock-client';
import type { ProjectDetail, SettingsUpdate } from '@/api/types';

const START = '2026-12-01T05:00:00.000Z';
const hours = (count: number) =>
  new Date(Date.parse(START) + count * 3_600_000).toISOString();

let api: BlockCalcApi;
let clock: Date;

async function configure(overrides: Partial<SettingsUpdate> = {}) {
  const current = await api.getSettings();
  return api.updateSettings({
    version: current.version,
    currency: 'RUB',
    sand_price_per_ton: '10',
    stone_price_per_ton: '20',
    cement_price_per_ton: '100',
    full_molds: 50,
    half_molds: 15,
    sand_kg_per_wheelbarrow: '100',
    stone_kg_per_wheelbarrow: '120',
    mix_yields: [1, 2, 3, 4].map((id) => ({
      id: id as 1 | 2 | 3 | 4,
      full_yield: id === 1 ? 22 : 35,
      half_yield: id === 1 ? 40 : 60,
    })),
    confirmed_zero_prices: [],
    ...overrides,
  });
}

async function draft(full = 1700, half = 300) {
  return api.createProject({
    name: 'School wall',
    requested_start_at: START,
    full_quantity: full,
    half_quantity: half,
    mix_id: 2,
  });
}

async function estimated(full = 1700, half = 300) {
  const created = await draft(full, half);
  return api.saveEstimate(created.project.id, {
    project_version: created.project.version,
    use_current_prices: false,
  });
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isApiError(error)) return error;
    throw error;
  }
  throw new Error('expected the call to be rejected');
}

beforeEach(() => {
  clock = new Date(START);
  api = createMockApi({ store: memoryStore(), now: () => clock });
});

describe('settings', () => {
  it('AT01: rejects negative prices and fractional mold counts', async () => {
    await configure();
    const error = await rejection(
      configure({ version: 2, sand_price_per_ton: '-1', full_molds: 1.5 }),
    );
    expect(error.status).toBe(422);
    expect(JSON.stringify(error.detail)).toContain('full_molds');
  });

  it('requires confirmation for a new zero price', async () => {
    const error = await rejection(configure({ sand_price_per_ton: '0' }));
    expect(error.status).toBe(422);
    const saved = await configure({
      sand_price_per_ton: '0',
      confirmed_zero_prices: ['sand'],
    });
    expect(saved.sand_price_per_ton).toBe('0');
  });

  it('AT11: rejects a save from a stale version', async () => {
    await configure();
    const error = await rejection(configure({ version: 1 }));
    expect(error.status).toBe(409);
  });
});

describe('projects and estimates', () => {
  beforeEach(async () => {
    await configure();
  });

  it('AT01: rejects an all-zero order', async () => {
    const error = await rejection(draft(0, 0));
    expect(error.status).toBe(422);
  });

  it('AT02: calculating without a mix returns no cost', async () => {
    const error = await rejection(
      api.calculateMaterials({
        full_quantity: 10,
        half_quantity: 0,
        mix_id: null,
      }),
    );
    expect(error.status).toBe(422);
    expect(error.message).toMatch(/mix/i);
  });

  it('AT05: a saved estimate keeps its prices after Settings change', async () => {
    const saved = await estimated();
    await configure({ version: 2, cement_price_per_ton: '120' });
    const reopened = await api.getProject(saved.project.id);
    expect(reopened.estimates.at(-1)?.results.total_cost).toBe('691.20');
    const fresh = await estimated();
    expect(fresh.estimates.at(-1)?.results.total_cost).toBe('745.20');
  });

  it('FR17: a revision keeps the previous one and its prices by default', async () => {
    const saved = await estimated();
    await configure({ version: 2, cement_price_per_ton: '120' });
    const revised = await api.saveEstimate(saved.project.id, {
      project_version: saved.project.version,
      use_current_prices: false,
    });
    expect(revised.estimates.map((e) => e.results.total_cost)).toEqual([
      '691.20',
      '691.20',
    ]);
    const repriced = await api.saveEstimate(saved.project.id, {
      project_version: revised.project.version,
      use_current_prices: true,
    });
    expect(repriced.estimates.at(-1)?.results.total_cost).toBe('745.20');
  });

  it('AT11: rejects an edit from a stale version', async () => {
    const saved = await estimated();
    const error = await rejection(
      api.saveEstimate(saved.project.id, {
        project_version: 1,
        use_current_prices: false,
      }),
    );
    expect(error.status).toBe(409);
  });
});

describe('production and collection', () => {
  let project: ProjectDetail;

  beforeEach(async () => {
    await configure({ full_molds: 5, half_molds: 0 });
    project = await estimated(10, 0);
    project = await api.planProduction(project.project.id, {
      project_version: project.project.version,
    });
    clock = new Date(hours(200));
  });

  const run = (index: number) => {
    const found = project.runs[index];
    if (!found) throw new Error(`missing run ${index}`);
    return found;
  };

  it('plans runs no larger than the mold count', () => {
    expect(project.project.status).toBe('planned');
    expect(project.runs.map((r) => r.quantity)).toEqual([5, 5]);
  });

  it('FR18: locks the order once production starts', async () => {
    project = await api.startRun(project.project.id, run(0).id, {
      event_key: 'start-1',
      started_at: START,
    });
    expect(project.project.status).toBe('in_production');
    const error = await rejection(
      api.updateProject(project.project.id, {
        ...project.project,
        full_quantity: 20,
        version: project.project.version,
      }),
    );
    expect(error.status).toBe(409);
  });

  it('confirms readiness only after 48 hours and a physical check', async () => {
    project = await api.startRun(project.project.id, run(0).id, {
      event_key: 'start-1',
      started_at: START,
    });
    const early = await rejection(
      api.confirmRunReady(project.project.id, run(0).id, {
        event_key: 'ready-early',
        ready_at: hours(47),
        physically_checked: true,
      }),
    );
    expect(early.status).toBe(422);
    project = await api.confirmRunReady(project.project.id, run(0).id, {
      event_key: 'ready-1',
      ready_at: hours(60),
      physically_checked: true,
    });
    expect(project.project.status).toBe('partially_ready');
    expect(project.balance.full.ready).toBe(5);
  });

  it('UC07–UC09: rejects event times that are invalid or in the future', async () => {
    const future = await rejection(
      api.startRun(project.project.id, run(0).id, {
        event_key: 'start-future',
        started_at: hours(201),
      }),
    );
    expect(future.status).toBe(422);
    const invalid = await rejection(
      api.startRun(project.project.id, run(0).id, {
        event_key: 'start-invalid',
        started_at: 'not a time',
      }),
    );
    expect(invalid.status).toBe(422);
    project = await api.startRun(project.project.id, run(0).id, {
      event_key: 'start-1',
      started_at: START,
    });
    const ready = await rejection(
      api.confirmRunReady(project.project.id, run(0).id, {
        event_key: 'ready-future',
        ready_at: hours(300),
        physically_checked: true,
      }),
    );
    expect(ready.status).toBe(422);
  });

  it('FR22: a run cannot start before the previous run was ready', async () => {
    project = await api.startRun(project.project.id, run(0).id, {
      event_key: 's1',
      started_at: START,
    });
    project = await api.confirmRunReady(project.project.id, run(0).id, {
      event_key: 'r1',
      ready_at: hours(60),
      physically_checked: true,
    });
    const overlap = await rejection(
      api.startRun(project.project.id, run(1).id, {
        event_key: 's2-early',
        started_at: hours(50),
      }),
    );
    expect(overlap.status).toBe(422);
    project = await api.startRun(project.project.id, run(1).id, {
      event_key: 's2',
      started_at: hours(60),
    });
    expect(project.runs[1]?.started_at).toBe(hours(60));
  });

  it('SC05: an overdue active run moves the forecast to now', async () => {
    project = await api.startRun(project.project.id, run(0).id, {
      event_key: 's1',
      started_at: START,
    });
    clock = new Date(hours(80));
    project = await api.getProject(project.project.id);
    expect(project.runs[0]?.expected_ready_at).toBe(hours(80));
    expect(project.runs[1]?.expected_ready_at).toBe(hours(128));
  });

  it('AT09 and AT11: collects within the balance and counts repeats once', async () => {
    project = await api.startRun(project.project.id, run(0).id, {
      event_key: 's',
      started_at: START,
    });
    project = await api.confirmRunReady(project.project.id, run(0).id, {
      event_key: 'r',
      ready_at: hours(48),
      physically_checked: true,
    });
    const collect = (key: string, amount: number) =>
      api.recordCollection(project.project.id, {
        event_key: key,
        full_quantity: amount,
        half_quantity: 0,
        collected_at: hours(50),
      });
    await collect('c1', 2);
    await collect('c1', 2);
    const rejected = await rejection(collect('c2', 4));
    expect(rejected.status).toBe(422);
    project = await collect('c3', 3);
    expect(project.balance.full.collected).toBe(5);
  });

  it('AT10: cancelling stops waiting runs and keeps active runs and history', async () => {
    project = await api.startRun(project.project.id, run(0).id, {
      event_key: 's',
      started_at: START,
    });
    project = await api.cancelProject(project.project.id, {
      project_version: project.project.version,
      reason: 'Customer withdrew the order',
    });
    expect(project.project.status).toBe('cancelled');
    expect(run(0).cancelled_at).toBeNull();
    expect(run(1).cancelled_at).not.toBeNull();
    expect(project.history[0]?.event_type).toBe('project.cancelled');
  });

  it('SC06: a collected project cannot be cancelled', async () => {
    for (const [index, key] of [
      [0, 'a'],
      [1, 'b'],
    ] as const) {
      project = await api.startRun(project.project.id, run(index).id, {
        event_key: `start-${key}`,
        started_at: hours(index * 48),
      });
      project = await api.confirmRunReady(project.project.id, run(index).id, {
        event_key: `ready-${key}`,
        ready_at: hours(index * 48 + 48),
        physically_checked: true,
      });
    }
    project = await api.recordCollection(project.project.id, {
      event_key: 'all',
      full_quantity: 10,
      half_quantity: 0,
      collected_at: hours(100),
    });
    expect(project.project.status).toBe('collected');
    const error = await rejection(
      api.cancelProject(project.project.id, {
        project_version: project.project.version,
        reason: 'Too late',
      }),
    );
    expect(error.status).toBe(409);
  });
});
