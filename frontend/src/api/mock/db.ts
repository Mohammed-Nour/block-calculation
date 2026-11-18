import type {
  Collection,
  EstimateRevision,
  HistoryEvent,
  Mix,
  ProductionRun,
  Project,
  SettingsValues,
} from '@/api/types';
import { DEFAULT_CURRENCY } from '@/data';

/** The mock's whole state. Every write replaces it in one step (NFR04). */
export interface MockState {
  schema: 1;
  settings: SettingsValues & { version: number; updated_at: string };
  mixes: Mix[];
  projects: Project[];
  estimates: Record<number, EstimateRevision[]>;
  runs: Record<number, Omit<ProductionRun, 'expected_ready_at'>[]>;
  collections: Record<number, Collection[]>;
  history: Record<number, HistoryEvent[]>;
  /** `${projectId}:${eventKey}` of every event already applied (FR31). */
  eventKeys: string[];
  nextId: number;
}

const STORAGE_KEY = 'blockcalc.mock-api.v1';

/** §8.1 recipes; yields are entered in Settings. */
const MIXES: Mix[] = [
  {
    id: 1,
    name: 'Mix 1',
    sand_wheelbarrows: '3',
    stone_wheelbarrows: '0',
    cement_bags: '1',
    full_yield: null,
    half_yield: null,
  },
  {
    id: 2,
    name: 'Mix 2',
    sand_wheelbarrows: '3',
    stone_wheelbarrows: '2',
    cement_bags: '1',
    full_yield: null,
    half_yield: null,
  },
  {
    id: 3,
    name: 'Mix 3',
    sand_wheelbarrows: '2.5',
    stone_wheelbarrows: '2.5',
    cement_bags: '1',
    full_yield: null,
    half_yield: null,
  },
  {
    id: 4,
    name: 'Mix 4',
    sand_wheelbarrows: '2',
    stone_wheelbarrows: '2',
    cement_bags: '1',
    full_yield: null,
    half_yield: null,
  },
];

/** Same starting point as the backend's first migration: nothing configured. */
export function emptyState(now = new Date().toISOString()): MockState {
  return {
    schema: 1,
    settings: {
      version: 1,
      updated_at: now,
      currency: DEFAULT_CURRENCY,
      sand_price_per_ton: null,
      stone_price_per_ton: null,
      cement_price_per_ton: null,
      full_molds: 0,
      half_molds: 0,
      sand_kg_per_wheelbarrow: null,
      stone_kg_per_wheelbarrow: null,
    },
    mixes: structuredClone(MIXES),
    projects: [],
    estimates: {},
    runs: {},
    collections: {},
    history: {},
    eventKeys: [],
    nextId: 1,
  };
}

/** Where the mock keeps its state. Tests pass an in-memory store. */
export interface MockStore {
  load: () => MockState;
  save: (state: MockState) => void;
}

export function memoryStore(initial: MockState = emptyState()): MockStore {
  let state = structuredClone(initial);
  return {
    load: () => structuredClone(state),
    save: (next) => {
      state = structuredClone(next);
    },
  };
}

/**
 * localStorage-backed store. Storage can be missing or full (private windows),
 * so it falls back to memory rather than breaking the app.
 */
export function browserStore(): MockStore {
  const fallback = memoryStore();
  let storageWorks = true;
  return {
    load() {
      if (!storageWorks) return fallback.load();
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { schema?: unknown };
          if (parsed.schema === 1) return parsed as MockState;
        }
        // Nothing stored yet (or an old schema): start fresh.
        return emptyState();
      } catch {
        // Unreadable storage: keep working in memory for this session.
        storageWorks = false;
        return fallback.load();
      }
    },
    save(state) {
      fallback.save(state);
      if (!storageWorks) return;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Quota or privacy mode: keep the in-memory copy.
        storageWorks = false;
      }
    },
  };
}
