import type { ProjectDetail } from '@/api';
import { FormAlert } from '@/components/common';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { ForecastCard } from '@/features/production/components/forecast-card';
import { RunRow } from '@/features/production/components/run-row';
import { usePlanProduction } from '@/features/production/hooks/mutations/use-run-actions';
import {
  canStartRun,
  runState,
  runSummary,
} from '@/features/production/utils/run-state';
import { getErrorMessage } from '@/lib';

/** UC06–UC08: forecast, the plan of runs, and recording their progress. */
export function ProductionSection({ detail }: { detail: ProjectDetail }) {
  const { project, runs } = detail;
  const plan = usePlanProduction(project.id, project.version);
  const hasEstimate = detail.estimates.length > 0;
  const hasLiveRuns = runs.some((run) => run.cancelled_at === null);
  // The full plan can be dozens of runs; show only what needs a decision now.
  const actionable = runs.filter(
    (run) =>
      runState(run) === 'in_molds' ||
      (project.status !== 'cancelled' && canStartRun(run, runs)),
  );

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
          {!hasLiveRuns ? (
            project.status === 'draft' || project.status === 'planned' ? (
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
            <>
              <p className="text-sm text-muted-foreground">
                {runSummary(runs)}
              </p>
              {actionable.length > 0 ? (
                <ol className="grid gap-2" aria-label="Runs that need action">
                  {actionable.map((run) => (
                    <RunRow
                      key={run.id}
                      run={run}
                      runs={runs}
                      project={project}
                    />
                  ))}
                </ol>
              ) : null}
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer font-medium">
                  All {runs.length} runs
                </summary>
                <ol className="mt-3 grid gap-2">
                  {runs.map((run) => (
                    <RunRow
                      key={run.id}
                      run={run}
                      runs={runs}
                      project={project}
                    />
                  ))}
                </ol>
              </details>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
