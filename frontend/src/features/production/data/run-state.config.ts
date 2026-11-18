import type { RunState } from '@/features/production/types/run-state';

export const RUN_STATE_LABELS: Record<RunState, string> = {
  waiting: 'Waiting',
  in_molds: 'In the molds',
  ready: 'Ready',
  cancelled: 'Cancelled',
};
