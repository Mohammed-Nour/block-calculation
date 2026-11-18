import type { ProjectDetail } from '@/api';
import { FormAlert, MaterialBreakdown } from '@/components/common';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { PriceSnapshot } from '@/features/estimates/components/price-snapshot';
import { RepriceDialog } from '@/features/estimates/components/reprice-dialog';
import { useSaveEstimate } from '@/features/estimates/hooks/mutations/use-save-estimate';
import {
  canSaveEstimate,
  isEstimateStale,
} from '@/features/estimates/utils/estimate-status';
import { formatDateTime, formatMoney, getErrorMessage } from '@/lib';

/** UC05 and FR15–FR17: the saved estimate, its prices and earlier revisions. */
export function EstimateSection({ detail }: { detail: ProjectDetail }) {
  const { project, estimates } = detail;
  const save = useSaveEstimate(project);
  const latest = estimates.at(-1);
  const earlier = estimates.slice(0, -1).reverse();
  const stale = isEstimateStale(project, latest);
  const editable = canSaveEstimate(project);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Material estimate
          {latest ? (
            <Badge variant="secondary">Revision {latest.revision}</Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          Saved estimates keep their prices when Settings change.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {!latest ? (
          <FormAlert tone="warning" title="No estimate saved yet">
            {project.mix_id === null
              ? 'Choose a mix for this draft, then save an estimate.'
              : 'Save an estimate to record the material cost with today’s prices.'}
          </FormAlert>
        ) : (
          <>
            {stale ? (
              <FormAlert
                tone="warning"
                title="The order changed after this estimate"
              >
                Save a revised estimate before planning production.
              </FormAlert>
            ) : null}
            <MaterialBreakdown
              calculation={latest.results}
              caption={`Estimate revision ${latest.revision}`}
            />
            <PriceSnapshot revision={latest} />
          </>
        )}

        {save.error ? (
          <FormAlert tone="error" title="The estimate was not saved">
            {getErrorMessage(save.error, 'Try again.')}
          </FormAlert>
        ) : null}

        {editable ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate(false)}
            >
              {latest ? 'Save revised estimate' : 'Save estimate'}
            </Button>
            {latest ? (
              <RepriceDialog
                disabled={save.isPending}
                onConfirm={() => save.mutate(true)}
              />
            ) : null}
          </div>
        ) : null}

        {earlier.length > 0 ? (
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer font-medium">
              Earlier revisions ({earlier.length})
            </summary>
            <ul className="mt-3 grid gap-2 text-sm">
              {earlier.map((revision) => (
                <li
                  key={revision.revision}
                  className="flex justify-between gap-4"
                >
                  <span>
                    Revision {revision.revision} ·{' '}
                    {formatDateTime(revision.created_at)}
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(
                      revision.results.total_cost,
                      revision.results.currency,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
