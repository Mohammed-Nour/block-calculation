import type { ProjectStatus } from '@/api/types';

type BadgeTone =
  | 'secondary'
  | 'outline'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'default';

/** §8.4 status values with the words and colour the User sees. */
export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; tone: BadgeTone; description: string }
> = {
  draft: { label: 'Draft', tone: 'outline', description: 'Not planned yet' },
  planned: {
    label: 'Planned',
    tone: 'secondary',
    description: 'Runs planned, none started',
  },
  in_production: {
    label: 'In production',
    tone: 'default',
    description: 'Runs in the molds',
  },
  partially_ready: {
    label: 'Partially ready',
    tone: 'warning',
    description: 'Some blocks ready',
  },
  ready: {
    label: 'Ready',
    tone: 'success',
    description: 'All blocks ready to collect',
  },
  collected: {
    label: 'Collected',
    tone: 'success',
    description: 'Whole order collected',
  },
  cancelled: {
    label: 'Cancelled',
    tone: 'destructive',
    description: 'Waiting work stopped',
  },
};

export const STATUS_FILTER_ALL = 'all';
