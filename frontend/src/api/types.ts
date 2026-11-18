/**
 * Wire shapes shared with the FastAPI backend (docs/api/README.md).
 * Field names are snake_case and decimals travel as strings ("10.50"),
 * exactly as the backend serializes them. Map them for display at the
 * query boundary; never restate these shapes elsewhere.
 */

/** A non-negative decimal sent as a string, e.g. "100.25". */
export type DecimalString = string;
/** ISO 8601 timestamp that keeps its timezone offset. */
export type Timestamp = string;

export type Material = 'sand' | 'stone' | 'cement';
export type BlockSize = 'full' | 'half';
export type MixId = 1 | 2 | 3 | 4;

export const PROJECT_STATUSES = [
  'draft',
  'planned',
  'in_production',
  'partially_ready',
  'ready',
  'collected',
  'cancelled',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

// ── Settings (implemented: GET/PUT /api/settings) ──────────────────────────

export interface SettingsValues {
  currency: string;
  sand_price_per_ton: DecimalString | null;
  stone_price_per_ton: DecimalString | null;
  cement_price_per_ton: DecimalString | null;
  full_molds: number;
  half_molds: number;
  sand_kg_per_wheelbarrow: DecimalString | null;
  stone_kg_per_wheelbarrow: DecimalString | null;
}

export interface MixYield {
  id: MixId;
  full_yield: number | null;
  half_yield: number | null;
}

export interface Mix extends MixYield {
  name: string;
  sand_wheelbarrows: DecimalString;
  stone_wheelbarrows: DecimalString;
  cement_bags: DecimalString;
}

export interface Settings extends SettingsValues {
  version: number;
  updated_at: Timestamp;
  mixes: Mix[];
}

export interface SettingsUpdate extends SettingsValues {
  version: number;
  mix_yields: MixYield[];
  confirmed_zero_prices: Material[];
}

// ── Calculation (backend: blockcalc/calculation.py) ────────────────────────

export interface MaterialOrder {
  full_quantity: number;
  half_quantity: number;
  mix_id: MixId | null;
}

export interface MaterialCost {
  tons: DecimalString;
  price_per_ton: DecimalString | null;
  cost: DecimalString;
}

export interface MaterialCalculation {
  mix_id: MixId;
  currency: string;
  full_batches: number;
  half_batches: number;
  total_batches: number;
  full_surplus: number;
  half_surplus: number;
  sand: MaterialCost;
  stone: MaterialCost;
  cement: MaterialCost;
  total_cost: DecimalString;
}

export interface CalculationInput extends MaterialOrder {
  /** Existing project whose saved calculation settings should be reused. */
  project_id?: number;
}

export interface MaterialPreview extends MaterialCalculation {
  settings_version?: number;
}

// ── Projects (proposed) ─────────────────────────────────────────────────────

export interface ProjectInput {
  name: string;
  requested_start_at: Timestamp;
  full_quantity: number;
  half_quantity: number;
  mix_id: MixId | null;
}

export interface Project extends ProjectInput {
  id: number;
  status: ProjectStatus;
  version: number;
  cancel_reason: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ProjectListItem extends Project {
  currency: string;
  latest_total_cost: DecimalString | null;
  expected_ready_at: Timestamp | null;
}

/** Everything an estimate used, so later Settings changes cannot alter it. */
export interface EstimateInputs {
  order: MaterialOrder;
  mix: Mix | null;
  /** All recipes and yields saved with the revision; older mock records have only mix. */
  mixes?: Mix[];
  settings: SettingsValues;
  settings_version: number;
}

export interface EstimateRevision {
  revision: number;
  created_at: Timestamp;
  inputs: EstimateInputs;
  results: MaterialCalculation;
}

export interface EstimateSave {
  project_version: number;
  /** Re-price a revision with current Settings (§8.2). Requires confirmation in the UI. */
  use_current_prices: boolean;
  /** Settings version used by a preview already shown to the User. */
  settings_version?: number;
}

export interface ProductionRun {
  id: number;
  estimate_revision: number;
  block_size: BlockSize;
  quantity: number;
  mold_capacity: number;
  planned_start_at: Timestamp;
  started_at: Timestamp | null;
  ready_at: Timestamp | null;
  cancelled_at: Timestamp | null;
  /** Expected ready time from the run's actual or planned start. */
  expected_ready_at: Timestamp;
}

export interface SizeForecast {
  quantity: number;
  molds: number;
  cycles: number;
  /** Null when the size has demand but no molds (SC03). */
  expected_ready_at: Timestamp | null;
}

export interface Forecast {
  full: SizeForecast;
  half: SizeForecast;
  duration_hours: number | null;
  expected_ready_at: Timestamp | null;
  untimed_sizes: BlockSize[];
}

export interface Collection {
  id: number;
  full_quantity: number;
  half_quantity: number;
  collected_at: Timestamp;
}

export interface SizeBalance {
  requested: number;
  ready: number;
  collected: number;
}

export interface HistoryEvent {
  id: number;
  event_type: string;
  actor_id: string;
  occurred_at: Timestamp;
  summary: string;
}

export interface ProjectDetail {
  project: Project;
  currency: string;
  estimates: EstimateRevision[];
  runs: ProductionRun[];
  collections: Collection[];
  balance: Record<BlockSize, SizeBalance>;
  forecast: Forecast | null;
  history: HistoryEvent[];
}

export interface PlanProduction {
  project_version: number;
}

/** `event_key` makes a repeated submit count once (FR31). */
export interface RunStart {
  event_key: string;
  started_at: Timestamp;
}

export interface RunReady {
  event_key: string;
  ready_at: Timestamp;
  physically_checked: boolean;
}

export interface CollectionInput {
  event_key: string;
  full_quantity: number;
  half_quantity: number;
  collected_at: Timestamp;
}

export interface CancelProject {
  project_version: number;
  reason: string;
}
