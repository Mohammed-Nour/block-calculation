import type {
  CancelProject,
  CollectionInput,
  EstimateSave,
  MaterialCalculation,
  MaterialOrder,
  PlanProduction,
  ProjectDetail,
  ProjectInput,
  ProjectListItem,
  ProjectStatus,
  RunReady,
  RunStart,
  Settings,
  SettingsUpdate,
} from '@/api/types';

/**
 * The HTTP contract in docs/api/README.md as a TypeScript interface. The mock
 * and HTTP clients both implement it, so screens never know which is active.
 * Every mutation resolves to the updated resource.
 */
export interface BlockCalcApi {
  getSettings: () => Promise<Settings>;
  updateSettings: (update: SettingsUpdate) => Promise<Settings>;

  /** Stateless preview with the current Settings; saves nothing. */
  calculateMaterials: (order: MaterialOrder) => Promise<MaterialCalculation>;

  listProjects: (status?: ProjectStatus) => Promise<ProjectListItem[]>;
  getProject: (id: number) => Promise<ProjectDetail>;
  createProject: (input: ProjectInput) => Promise<ProjectDetail>;
  updateProject: (
    id: number,
    input: ProjectInput & { version: number },
  ) => Promise<ProjectDetail>;
  saveEstimate: (id: number, input: EstimateSave) => Promise<ProjectDetail>;
  planProduction: (id: number, input: PlanProduction) => Promise<ProjectDetail>;
  startRun: (
    id: number,
    runId: number,
    input: RunStart,
  ) => Promise<ProjectDetail>;
  confirmRunReady: (
    id: number,
    runId: number,
    input: RunReady,
  ) => Promise<ProjectDetail>;
  recordCollection: (
    id: number,
    input: CollectionInput,
  ) => Promise<ProjectDetail>;
  cancelProject: (id: number, input: CancelProject) => Promise<ProjectDetail>;
}
