import type { ProductionRun, Project } from '@/api';
import { Badge } from '@/components/ui';
import { BLOCK_SIZES } from '@/data';
import { ConfirmReadyDialog } from '@/features/production/components/confirm-ready-dialog';
import { StartRunDialog } from '@/features/production/components/start-run-dialog';
import { RUN_STATE_LABELS } from '@/features/production/data/run-state.config';
import {
  canStartRun,
  runNumber,
  runState,
} from '@/features/production/utils/run-state';
import { formatDateTime } from '@/lib';

const STATE_TONE = {
  waiting: 'outline',
  in_molds: 'default',
  ready: 'success',
  cancelled: 'destructive',
} as const;

interface RunRowProps {
  run: ProductionRun;
  runs: ProductionRun[];
  project: Project;
}

/** One run with its state and the single action it allows now. */
export function RunRow({ run, runs, project }: RunRowProps) {
  const state = runState(run);
  const when =
    state === 'ready'
      ? `Ready ${formatDateTime(run.ready_at)}`
      : state === 'cancelled'
        ? `Cancelled ${formatDateTime(run.cancelled_at)}`
        : `Expected ready ${formatDateTime(run.expected_ready_at)}`;
  return (
    <li className="flex flex-col gap-2 rounded-md border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid gap-0.5">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {BLOCK_SIZES[run.block_size].label} run {runNumber(run, runs)}:{' '}
          {run.quantity} blocks
          <Badge variant={STATE_TONE[state]}>{RUN_STATE_LABELS[state]}</Badge>
        </span>
        <span className="text-sm text-muted-foreground">
          {when}
          {run.started_at ? ` · started ${formatDateTime(run.started_at)}` : ''}
        </span>
      </div>
      <div className="flex gap-2">
        {project.status !== 'cancelled' && canStartRun(run, runs) ? (
          <StartRunDialog projectId={project.id} run={run} />
        ) : null}
        {state === 'in_molds' ? (
          <ConfirmReadyDialog projectId={project.id} run={run} />
        ) : null}
      </div>
    </li>
  );
}
