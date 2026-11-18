import type { BlockCalcApi } from '@/api/client';
import {
  ApiError,
  conflictError,
  notFoundError,
  validationError,
} from '@/api/errors';
import type {
  BlockSize,
  EstimateRevision,
  Project,
  ProjectDetail,
  ProjectInput,
  ProjectListItem,
  Mix,
  Settings,
  SettingsValues,
} from '@/api/types';
import type { MockState, MockStore } from '@/api/mock/db';
import {
  MissingCalculationInputs,
  calculateMaterials,
} from '@/api/mock/rules/materials';
import {
  balances,
  deriveStatus,
  forecastOrder,
  forecastRuns,
  hoursBetween,
  isOrderLocked,
  planRuns,
  withExpectedTimes,
} from '@/api/mock/rules/production';
import type { Quantities } from '@/api/mock/rules/production';
import {
  validateCollection,
  validateProject,
  validateEventTime,
  validateSettings,
} from '@/api/mock/rules/validation';
import { CYCLE_HOURS } from '@/data';

/** The single User of the first release (§2.2); FR30 records it on history. */
const ACTOR_ID = 'local-user';

interface MockOptions {
  store: MockStore;
  now?: () => Date;
}

/**
 * In-browser implementation of the API contract. It applies the same rules
 * the backend does, so the frontend can be built and usability-tested before
 * the backend endpoints exist. Each call works on a copy of the state and
 * saves it only when the whole operation succeeds (NFR04).
 */
export function createMockApi({
  store,
  now = () => new Date(),
}: MockOptions): BlockCalcApi {
  const timestamp = () => now().toISOString();

  function read<T>(fn: (state: MockState) => T): Promise<T> {
    try {
      return Promise.resolve(fn(store.load()));
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  function write<T>(fn: (state: MockState) => T): Promise<T> {
    try {
      const state = store.load();
      const result = fn(state);
      store.save(state);
      return Promise.resolve(result);
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  const settingsOf = (state: MockState): Settings => ({
    ...state.settings,
    mixes: state.mixes,
  });

  const molds = (state: MockState): Quantities => ({
    full: state.settings.full_molds,
    half: state.settings.half_molds,
  });

  const quantities = (project: ProjectInput): Quantities => ({
    full: project.full_quantity,
    half: project.half_quantity,
  });

  function findProject(state: MockState, id: number): Project {
    const project = state.projects.find((candidate) => candidate.id === id);
    if (!project) throw notFoundError('Project not found');
    return project;
  }

  function checkVersion(project: Project, version: number) {
    if (project.version !== version) {
      throw conflictError(
        'This project has changed since you opened it. Reload it before saving.',
        project.version,
      );
    }
  }

  function record(
    state: MockState,
    project: Project,
    eventType: string,
    summary: string,
  ) {
    const events = (state.history[project.id] ??= []);
    events.push({
      id: state.nextId++,
      event_type: eventType,
      actor_id: ACTOR_ID,
      occurred_at: timestamp(),
      summary,
    });
  }

  /** Recompute status after any change and bump the version (FR32). */
  function touch(state: MockState, project: Project) {
    const runs = withExpectedTimes(state.runs[project.id] ?? [], timestamp());
    const balance = balances(
      quantities(project),
      runs,
      state.collections[project.id] ?? [],
    );
    project.status = deriveStatus(
      project.status === 'cancelled',
      runs,
      balance,
    );
    project.version += 1;
    project.updated_at = timestamp();
  }

  /** Returns true when this event was already applied (FR31). */
  function seenEvent(state: MockState, projectId: number, eventKey: string) {
    const key = `${projectId}:${eventKey}`;
    if (state.eventKeys.includes(key)) return true;
    state.eventKeys.push(key);
    return false;
  }

  function latestEstimate(
    state: MockState,
    id: number,
  ): EstimateRevision | undefined {
    return (state.estimates[id] ?? []).at(-1);
  }

  function estimateMatches(
    project: Project,
    estimate: EstimateRevision | undefined,
  ) {
    return (
      estimate !== undefined &&
      estimate.inputs.order.full_quantity === project.full_quantity &&
      estimate.inputs.order.half_quantity === project.half_quantity &&
      estimate.inputs.order.mix_id === project.mix_id
    );
  }

  function detail(state: MockState, id: number): ProjectDetail {
    const project = findProject(state, id);
    const runs = withExpectedTimes(state.runs[id] ?? [], timestamp());
    const collections = state.collections[id] ?? [];
    const forecast =
      runs.length > 0
        ? forecastRuns(
            project.requested_start_at,
            runs,
            quantities(project),
            molds(state),
          )
        : forecastOrder(
            project.requested_start_at,
            quantities(project),
            molds(state),
          );
    return {
      project: structuredClone(project),
      currency: state.settings.currency,
      estimates: structuredClone(state.estimates[id] ?? []),
      runs,
      collections: structuredClone(collections),
      balance: balances(quantities(project), runs, collections),
      forecast,
      history: structuredClone(state.history[id] ?? []).reverse(),
    };
  }

  function listItem(state: MockState, project: Project): ProjectListItem {
    const { forecast } = detail(state, project.id);
    return {
      ...structuredClone(project),
      currency: state.settings.currency,
      // FR28: show a cost only while the latest estimate matches the order.
      latest_total_cost: estimateMatches(
        project,
        latestEstimate(state, project.id),
      )
        ? (latestEstimate(state, project.id)?.results.total_cost ?? null)
        : null,
      expected_ready_at: forecast?.expected_ready_at ?? null,
    };
  }

  function calculate(
    state: MockState,
    order: ProjectInput,
    settings: SettingsValues = state.settings,
    mixes: Mix[] = state.mixes,
  ) {
    try {
      return calculateMaterials(order, settings, mixes);
    } catch (error) {
      if (error instanceof MissingCalculationInputs) {
        throw new ApiError(422, {
          message:
            error.fields[0] === 'mix_id'
              ? 'Choose a mix before calculating the cost.'
              : 'Some settings are missing. Complete them before calculating.',
          missing_fields: error.fields,
        });
      }
      throw error;
    }
  }

  /** FR08: changing the order or mix clears the unsaved production plan. */
  function clearPlan(state: MockState, project: Project) {
    if ((state.runs[project.id] ?? []).length > 0) {
      state.runs[project.id] = [];
      record(
        state,
        project,
        'plan.cleared',
        'Production plan cleared after a change',
      );
    }
  }

  function findRun(state: MockState, projectId: number, runId: number) {
    const run = (state.runs[projectId] ?? []).find(
      (candidate) => candidate.id === runId,
    );
    if (!run) throw notFoundError('Production run not found');
    return run;
  }

  const sizeLabel = (size: BlockSize) => (size === 'full' ? 'full' : 'half');

  return {
    getSettings: () => read(settingsOf),

    updateSettings: (update) =>
      write((state) => {
        const current = settingsOf(state);
        if (update.version !== current.version) {
          throw conflictError(
            'Settings have changed. Reload them before saving.',
            current.version,
          );
        }
        const issues = validateSettings(update, current);
        if (issues.length > 0) throw validationError(issues);
        state.settings = {
          currency: update.currency.trim().toUpperCase(),
          sand_price_per_ton: update.sand_price_per_ton,
          stone_price_per_ton: update.stone_price_per_ton,
          cement_price_per_ton: update.cement_price_per_ton,
          full_molds: update.full_molds,
          half_molds: update.half_molds,
          sand_kg_per_wheelbarrow: update.sand_kg_per_wheelbarrow,
          stone_kg_per_wheelbarrow: update.stone_kg_per_wheelbarrow,
          version: current.version + 1,
          updated_at: timestamp(),
        };
        state.mixes = state.mixes.map((mix) => {
          const yields = update.mix_yields.find((entry) => entry.id === mix.id);
          return yields
            ? {
                ...mix,
                full_yield: yields.full_yield,
                half_yield: yields.half_yield,
              }
            : mix;
        });
        return settingsOf(state);
      }),

    calculateMaterials: (order) =>
      read((state) =>
        calculate(state, { ...order, name: '', requested_start_at: '' }),
      ),

    listProjects: (status) =>
      read((state) =>
        state.projects
          .filter((project) => !status || project.status === status)
          .sort((a, b) => b.id - a.id)
          .map((project) => listItem(state, project)),
      ),

    getProject: (id) => read((state) => detail(state, id)),

    createProject: (input) =>
      write((state) => {
        const issues = validateProject(input);
        if (issues.length > 0) throw validationError(issues);
        const created = timestamp();
        const project: Project = {
          ...input,
          name: input.name.trim(),
          id: state.nextId++,
          status: 'draft',
          version: 1,
          cancel_reason: null,
          created_at: created,
          updated_at: created,
        };
        state.projects.push(project);
        record(state, project, 'project.created', 'Draft created');
        return detail(state, project.id);
      }),

    updateProject: (id, { version, ...input }) =>
      write((state) => {
        const project = findProject(state, id);
        checkVersion(project, version);
        if (isOrderLocked(project.status)) {
          throw conflictError(
            'Quantities and mix are locked once production starts.',
            project.version,
          );
        }
        const issues = validateProject(input);
        if (issues.length > 0) throw validationError(issues);
        const orderChanged =
          input.full_quantity !== project.full_quantity ||
          input.half_quantity !== project.half_quantity ||
          input.mix_id !== project.mix_id ||
          input.requested_start_at !== project.requested_start_at;
        Object.assign(project, input, { name: input.name.trim() });
        if (orderChanged) clearPlan(state, project);
        record(state, project, 'project.updated', 'Draft updated');
        touch(state, project);
        return detail(state, id);
      }),

    saveEstimate: (id, { project_version, use_current_prices }) =>
      write((state) => {
        const project = findProject(state, id);
        checkVersion(project, project_version);
        if (isOrderLocked(project.status)) {
          throw conflictError(
            'Estimates are locked once production starts.',
            project.version,
          );
        }
        const previous = latestEstimate(state, id);
        // §8.2: a revision keeps its original prices unless current ones are chosen.
        const keepSnapshot = previous !== undefined && !use_current_prices;
        const settings = keepSnapshot
          ? previous.inputs.settings
          : state.settings;
        const snapshotMix =
          keepSnapshot && previous.inputs.mix.id === project.mix_id
            ? previous.inputs.mix
            : undefined;
        const mixes = snapshotMix ? [snapshotMix] : state.mixes;
        const results = calculate(state, project, settings, mixes);
        const mix = mixes.find((candidate) => candidate.id === project.mix_id);
        if (!mix) throw notFoundError('Mix not found');
        const revisions = (state.estimates[id] ??= []);
        revisions.push({
          revision: revisions.length + 1,
          created_at: timestamp(),
          inputs: {
            order: {
              full_quantity: project.full_quantity,
              half_quantity: project.half_quantity,
              mix_id: project.mix_id,
            },
            mix: structuredClone(mix),
            settings: structuredClone(settings),
            settings_version: keepSnapshot
              ? previous.inputs.settings_version
              : state.settings.version,
          },
          results,
        });
        clearPlan(state, project);
        record(
          state,
          project,
          'estimate.saved',
          `Estimate revision ${revisions.length} saved: ${results.total_cost} ${results.currency}`,
        );
        touch(state, project);
        return detail(state, id);
      }),

    planProduction: (id, { project_version }) =>
      write((state) => {
        const project = findProject(state, id);
        checkVersion(project, project_version);
        if (project.status !== 'draft') {
          throw conflictError('Only a draft can be planned.', project.version);
        }
        const estimate = latestEstimate(state, id);
        if (!estimateMatches(project, estimate) || !estimate) {
          throw new ApiError(422, {
            message:
              'Save an estimate for the current order before planning production.',
          });
        }
        const forecast = forecastOrder(
          project.requested_start_at,
          quantities(project),
          molds(state),
        );
        if (forecast.untimed_sizes.length > 0) {
          throw new ApiError(422, {
            message: `No ${forecast.untimed_sizes.join(' or ')} molds are set. Add molds in Settings before planning.`,
            untimed_sizes: forecast.untimed_sizes,
          });
        }
        state.runs[id] = planRuns(
          project.requested_start_at,
          quantities(project),
          molds(state),
          estimate.revision,
        ).map((run) => ({ ...run, id: state.nextId++ }));
        record(
          state,
          project,
          'plan.created',
          `Planned ${state.runs[id].length} production runs`,
        );
        touch(state, project);
        return detail(state, id);
      }),

    startRun: (id, runId, { event_key, started_at }) =>
      write((state) => {
        const project = findProject(state, id);
        if (seenEvent(state, id, event_key)) return detail(state, id);
        const run = findRun(state, id, runId);
        if (project.status === 'cancelled' || run.cancelled_at !== null) {
          throw conflictError('This run was cancelled.', project.version);
        }
        if (run.started_at !== null)
          throw conflictError('This run has already started.', project.version);
        const busy = (state.runs[id] ?? []).some(
          (other) =>
            other.block_size === run.block_size &&
            other.started_at !== null &&
            other.ready_at === null,
        );
        if (busy) {
          throw conflictError(
            `The ${sizeLabel(run.block_size)} molds are still in use. Confirm the active run before starting the next one.`,
            project.version,
          );
        }
        const startIssues = validateEventTime(
          'started_at',
          started_at,
          now(),
          'start',
        );
        // FR22: the molds are free only once the previous run was ready.
        const overlap = (state.runs[id] ?? []).find(
          (other) =>
            other.block_size === run.block_size &&
            other.ready_at !== null &&
            startIssues.length === 0 &&
            Date.parse(other.ready_at) > Date.parse(started_at),
        );
        if (overlap?.ready_at) {
          startIssues.push({
            loc: ['body', 'started_at'],
            msg: `The ${sizeLabel(run.block_size)} molds were in use until ${overlap.ready_at}. Choose a later start time.`,
            type: 'value_error',
          });
        }
        if (startIssues.length > 0) throw validationError(startIssues);
        run.started_at = started_at;
        record(
          state,
          project,
          'run.started',
          `Started ${run.quantity} ${sizeLabel(run.block_size)} blocks`,
        );
        touch(state, project);
        return detail(state, id);
      }),

    confirmRunReady: (id, runId, { event_key, ready_at, physically_checked }) =>
      write((state) => {
        const project = findProject(state, id);
        if (seenEvent(state, id, event_key)) return detail(state, id);
        const run = findRun(state, id, runId);
        if (run.started_at === null)
          throw conflictError(
            'Start this run before confirming it.',
            project.version,
          );
        if (run.ready_at !== null)
          throw conflictError(
            'This run is already confirmed ready.',
            project.version,
          );
        const timeIssues = validateEventTime(
          'ready_at',
          ready_at,
          now(),
          'ready',
        );
        const issues = [...timeIssues];
        if (!physically_checked) {
          issues.push({
            loc: ['body', 'physically_checked'],
            msg: 'Confirm the blocks were checked on site',
            type: 'value_error',
          });
        }
        if (
          timeIssues.length === 0 &&
          hoursBetween(run.started_at, ready_at) < CYCLE_HOURS
        ) {
          issues.push({
            loc: ['body', 'ready_at'],
            msg: `A run can be confirmed only ${CYCLE_HOURS} hours after it started`,
            type: 'value_error',
          });
        }
        if (issues.length > 0) throw validationError(issues);
        run.ready_at = ready_at;
        record(
          state,
          project,
          'run.ready',
          `${run.quantity} ${sizeLabel(run.block_size)} blocks ready`,
        );
        touch(state, project);
        return detail(state, id);
      }),

    recordCollection: (id, input) =>
      write((state) => {
        const project = findProject(state, id);
        if (seenEvent(state, id, input.event_key)) return detail(state, id);
        const issues = [
          ...validateCollection(input, detail(state, id).balance),
          ...validateEventTime(
            'collected_at',
            input.collected_at,
            now(),
            'collection',
          ),
        ];
        if (issues.length > 0) throw validationError(issues);
        const collections = (state.collections[id] ??= []);
        collections.push({
          id: state.nextId++,
          full_quantity: input.full_quantity,
          half_quantity: input.half_quantity,
          collected_at: input.collected_at,
        });
        record(
          state,
          project,
          'collection.recorded',
          `Collected ${input.full_quantity} full and ${input.half_quantity} half blocks`,
        );
        touch(state, project);
        return detail(state, id);
      }),

    cancelProject: (id, { project_version, reason }) =>
      write((state) => {
        const project = findProject(state, id);
        checkVersion(project, project_version);
        if (project.status === 'collected') {
          throw conflictError(
            'A collected project cannot be cancelled.',
            project.version,
          );
        }
        if (project.status === 'cancelled') {
          throw conflictError(
            'This project is already cancelled.',
            project.version,
          );
        }
        if (!reason.trim()) {
          throw validationError([
            {
              loc: ['body', 'reason'],
              msg: 'Enter a reason for cancelling',
              type: 'value_error',
            },
          ]);
        }
        const cancelledAt = timestamp();
        for (const run of state.runs[id] ?? []) {
          if (run.started_at === null) run.cancelled_at = cancelledAt;
        }
        project.status = 'cancelled';
        project.cancel_reason = reason.trim();
        record(
          state,
          project,
          'project.cancelled',
          `Cancelled: ${reason.trim()}`,
        );
        touch(state, project);
        return detail(state, id);
      }),
  };
}
