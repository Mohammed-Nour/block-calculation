/** @vitest-environment node */
import { spawn } from 'node:child_process';
import type { Buffer } from 'node:buffer';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BlockCalcApi } from '@/api/client';
import { createHttpApi } from '@/api/http';

const HOUR = 3_600_000;

describe.runIf(process.env.BLOCKCALC_TEST_PYTHON)(
  'HTTP client against FastAPI',
  () => {
    let api: BlockCalcApi;
    let server: ChildProcess | undefined;
    let directory: string;
    const start = () => new Date(Date.now() - 72 * HOUR).toISOString();

    beforeAll(async () => {
      directory = await mkdtemp(resolve(tmpdir(), 'blockcalc-http-'));
      const listener = createServer();
      listener.listen(0, '127.0.0.1');
      await once(listener, 'listening');
      const address = listener.address();
      if (!address || typeof address === 'string')
        throw new Error('No test port');
      listener.close();
      await once(listener, 'close');
      const python = resolve(process.env.BLOCKCALC_TEST_PYTHON ?? '');
      server = spawn(
        python,
        ['-m', 'uvicorn', 'blockcalc.app:app', '--port', String(address.port)],
        {
          cwd: resolve('../backend'),
          env: {
            ...process.env,
            PYTHONDONTWRITEBYTECODE: '1',
            BLOCKCALC_DB_PATH: resolve(directory, 'db.sqlite3'),
          },
          stdio: ['ignore', 'ignore', 'pipe'],
        },
      );
      let output = '';
      server.stderr?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      server.on('error', (error) => {
        output += error.message;
      });
      const baseURL = `http://127.0.0.1:${address.port}`;
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          const response = await fetch(`${baseURL}/health`);
          ready = response.ok;
        } catch {
          ready = false;
        }
        if (ready) break;
        if (server.exitCode !== null) throw new Error(output);
        await delay(50);
      }
      if (!ready) throw new Error(`API did not start: ${output}`);
      api = createHttpApi(baseURL);
    }, 15_000);

    afterAll(async () => {
      if (server?.pid && server.exitCode === null) {
        server.kill();
        await once(server, 'exit');
      }
      if (directory) await rm(directory, { recursive: true, force: true });
    });

    beforeEach(async () => {
      const current = await api.getSettings();
      await api.updateSettings({
        version: current.version,
        currency: 'RUB',
        sand_price_per_ton: '10',
        stone_price_per_ton: '20',
        cement_price_per_ton: '100',
        full_molds: 50,
        half_molds: 15,
        sand_kg_per_wheelbarrow: '100',
        stone_kg_per_wheelbarrow: '120',
        mix_yields: current.mixes.map((mix) => ({
          id: mix.id,
          full_yield: 35,
          half_yield: 60,
        })),
        confirmed_zero_prices: [],
      });
    });

    const draft = (full = 1700, half = 300) =>
      api.createProject({
        name: 'HTTP integration order',
        requested_start_at: start(),
        full_quantity: full,
        half_quantity: half,
        mix_id: 2,
      });

    it('previews all four mixes and exposes missing inputs in the shared error format', async () => {
      for (const [mix_id, total] of [
        [1, '432.00'],
        [2, '691.20'],
        [3, '729.00'],
        [4, '637.20'],
      ] as const) {
        const calculation = await api.calculateMaterials({
          full_quantity: 1700,
          half_quantity: 300,
          mix_id,
        });
        expect(calculation.total_cost).toBe(total);
      }
      await expect(
        api.calculateMaterials({
          full_quantity: 1,
          half_quantity: 0,
          mix_id: null,
        }),
      ).rejects.toMatchObject({
        status: 422,
        detail: { missing_fields: ['mix_id'] },
      });
    });

    it('saves revisions using saved prices and explicitly refreshes current prices', async () => {
      let detail = await draft();
      detail = await api.saveEstimate(detail.project.id, {
        project_version: detail.project.version,
        use_current_prices: false,
      });
      expect(detail.estimates[0]?.results.total_cost).toBe('691.20');
      const settings = await api.getSettings();
      const { mixes, updated_at, ...values } = settings;
      expect(Date.parse(updated_at)).not.toBeNaN();
      await api.updateSettings({
        ...values,
        cement_price_per_ton: '120',
        mix_yields: mixes.map(({ id, full_yield, half_yield }) => ({
          id,
          full_yield,
          half_yield,
        })),
        confirmed_zero_prices: [],
      });
      const editPreview = await api.calculateMaterials({
        full_quantity: 1700,
        half_quantity: 300,
        mix_id: 2,
        project_id: detail.project.id,
      });
      expect(editPreview.total_cost).toBe('691.20');
      detail = await api.saveEstimate(detail.project.id, {
        project_version: detail.project.version,
        use_current_prices: false,
        settings_version: editPreview.settings_version,
      });
      expect(detail.estimates[1]?.results.total_cost).toBe('691.20');
      detail = await api.saveEstimate(detail.project.id, {
        project_version: detail.project.version,
        use_current_prices: true,
      });
      expect(
        detail.estimates.map((estimate) => estimate.results.total_cost),
      ).toEqual(['691.20', '691.20', '745.20']);
      expect(detail.estimates[2]?.inputs.mix.id).toBe(2);
      expect((await api.getProject(detail.project.id)).estimates).toEqual(
        detail.estimates,
      );
      expect(
        (await api.listProjects()).find(
          (project) => project.id === detail.project.id,
        )?.latest_total_cost,
      ).toBe('745.20');
    });

    it('rejects a new-order save when settings changed after the displayed preview', async () => {
      const preview = await api.calculateMaterials({
        full_quantity: 1700,
        half_quantity: 300,
        mix_id: 2,
      });
      const settings = await api.getSettings();
      const { mixes, updated_at, ...values } = settings;
      expect(Date.parse(updated_at)).not.toBeNaN();
      await api.updateSettings({
        ...values,
        cement_price_per_ton: '120',
        mix_yields: mixes.map(({ id, full_yield, half_yield }) => ({
          id,
          full_yield,
          half_yield,
        })),
        confirmed_zero_prices: [],
      });
      const detail = await draft();
      await expect(
        api.saveEstimate(detail.project.id, {
          project_version: detail.project.version,
          use_current_prices: false,
          settings_version: preview.settings_version,
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect((await api.getProject(detail.project.id)).estimates).toHaveLength(
        0,
      );
    });

    it('plans, starts, confirms, and partially collects without duplicate events', async () => {
      let detail = await draft(10, 0);
      detail = await api.saveEstimate(detail.project.id, {
        project_version: detail.project.version,
        use_current_prices: false,
      });
      detail = await api.planProduction(detail.project.id, {
        project_version: detail.project.version,
      });
      const run = detail.runs[0];
      if (!run) throw new Error('Missing planned run');
      const event = { event_key: 'http-start', started_at: start() };
      detail = await api.startRun(detail.project.id, run.id, event);
      expect(
        (await api.startRun(detail.project.id, run.id, event)).project.version,
      ).toBe(detail.project.version);
      await expect(
        api.updateProject(detail.project.id, {
          name: detail.project.name,
          requested_start_at: detail.project.requested_start_at,
          full_quantity: 11,
          half_quantity: 0,
          mix_id: 2,
          version: detail.project.version,
        }),
      ).rejects.toMatchObject({ status: 409 });
      detail = await api.confirmRunReady(detail.project.id, run.id, {
        event_key: 'http-ready',
        ready_at: new Date(Date.now() - 24 * HOUR).toISOString(),
        physically_checked: true,
      });
      detail = await api.recordCollection(detail.project.id, {
        event_key: 'http-four',
        full_quantity: 4,
        half_quantity: 0,
        collected_at: new Date().toISOString(),
      });
      expect(detail.balance.full.collected).toBe(4);
      await expect(
        api.recordCollection(detail.project.id, {
          event_key: 'http-over',
          full_quantity: 7,
          half_quantity: 0,
          collected_at: new Date().toISOString(),
        }),
      ).rejects.toMatchObject({ status: 422 });
      detail = await api.recordCollection(detail.project.id, {
        event_key: 'http-six',
        full_quantity: 6,
        half_quantity: 0,
        collected_at: new Date().toISOString(),
      });
      expect(detail.project.status).toBe('collected');
    });

    it('cancels waiting work and keeps active runs and history', async () => {
      let detail = await draft(51, 0);
      detail = await api.saveEstimate(detail.project.id, {
        project_version: detail.project.version,
        use_current_prices: false,
      });
      detail = await api.planProduction(detail.project.id, {
        project_version: detail.project.version,
      });
      const run = detail.runs[0];
      if (!run) throw new Error('Missing planned run');
      detail = await api.startRun(detail.project.id, run.id, {
        event_key: 'cancel-start',
        started_at: start(),
      });
      detail = await api.cancelProject(detail.project.id, {
        project_version: detail.project.version,
        reason: 'Cancelled by customer',
      });
      expect(detail.project.status).toBe('cancelled');
      expect(detail.runs[0]?.cancelled_at).toBeNull();
      expect(detail.runs[1]?.cancelled_at).toBeTruthy();
      expect(
        detail.history.some(
          (event) => event.event_type === 'project.cancelled',
        ),
      ).toBe(true);
    });
  },
);
