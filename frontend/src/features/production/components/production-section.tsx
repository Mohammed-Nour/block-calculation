import type { ProjectDetail } from '@/api';
import { FormAlert } from '@/components/common';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { BLOCK_SIZES } from '@/data';
import { RUN_STATE_LABELS } from '@/features/production/data/run-state.config';
import { ConfirmReadyDialog } from '@/features/production/components/confirm-ready-dialog';
import { ForecastCard } from '@/features/production/components/forecast-card';
import { StartRunDialog } from '@/features/production/components/start-run-dialog';
import { usePlanProduction } from '@/features/production/hooks/mutations/use-run-actions';
import { canStartRun, runState } from '@/features/production/utils/run-state';
import { formatDateTime, getErrorMessage } from '@/lib';

const STATE_TONE = {
  waiting: 'outline',
  in_molds: 'default',
  ready: 'success',
  cancelled: 'destructive',
} as const;

/** UC06–UC08: forecast, the plan of runs, and recording their progress. */
export function ProductionSection({ detail }: { detail: ProjectDetail }) {
  const { project, runs } = detail;
  const plan = usePlanProduction(project.id, project.version);
  const hasEstimate = detail.estimates.length > 0;

  return (
    <div className="grid gap-6">
      <ForecastCard forecast={detail.forecast} />
      <Card>
        <CardHeader>
          <CardTitle>Production runs</CardTitle>
          <CardDescription>
            Each run fills the molds once. Start a run when the blocks go in;
            confirm it when they are cured.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {runs.length === 0 ? (
            project.status === 'draft' ? (
              <div className="grid gap-3">
                <p className="text-sm text-muted-foreground">
                  {hasEstimate
                    ? 'Plan production to split the order into runs that fit the molds.'
                    : 'Save an estimate first, then plan production.'}
                </p>
                {plan.error ? (
                  <FormAlert tone="error" title="Production was not planned">
                    {getErrorMessage(plan.error, 'Try again.')}
                  </FormAlert>
                ) : null}
                <Button
                  className="w-full sm:w-auto sm:justify-self-start"
                  disabled={!hasEstimate || plan.isPending}
                  onClick={() => plan.mutate()}
                >
                  {plan.isPending ? 'Planning…' : 'Plan production'}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No runs.</p>
            )
          ) : (
            <ol className="grid gap-2">
              {runs.map((run, index) => {
                const state = runState(run);
                return (
                  <li
                    key={run.id}
                    className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="grid gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        Run {index + 1}: {run.quantity}{' '}
                        {BLOCK_SIZES[run.block_size].label.toLowerCase()}
                        <Badge variant={STATE_TONE[state]}>
                          {RUN_STATE_LABELS[state]}
                        </Badge>
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {state === 'ready'
                          ? `Ready ${formatDateTime(run.ready_at)}`
                          : state === 'cancelled'
                            ? `Cancelled ${formatDateTime(run.cancelled_at)}`
                            : `Expected ready ${formatDateTime(run.expected_ready_at)}`}
                        {run.started_at
                          ? ` · started ${formatDateTime(run.started_at)}`
                          : ''}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {canStartRun(run, runs) &&
                      project.status !== 'cancelled' ? (
                        <StartRunDialog projectId={project.id} run={run} />
                      ) : null}
                      {state === 'in_molds' ? (
                        <ConfirmReadyDialog projectId={project.id} run={run} />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
