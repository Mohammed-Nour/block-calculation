import { Link } from '@tanstack/react-router';

import type { ProjectDetail } from '@/api';
import { FormAlert, StatusBadge } from '@/components/common';
import { Card, CardContent, buttonVariants } from '@/components/ui';
import { BLOCK_SIZES, BLOCK_SIZE_ORDER, PROJECT_STATUS_META } from '@/data';
import { CancelProjectDialog } from '@/features/projects/components/cancel-project-dialog';
import { formatCount, formatDateTime } from '@/lib';

/** FR28: the order at a glance, with the actions its status allows. */
export function ProjectOverview({ detail }: { detail: ProjectDetail }) {
  const { project, balance } = detail;
  const editable = project.status === 'draft' || project.status === 'planned';
  const cancellable =
    project.status !== 'collected' && project.status !== 'cancelled';

  return (
    <Card>
      <CardContent className="grid gap-5 pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={project.status} />
          <span className="text-sm text-muted-foreground">
            {PROJECT_STATUS_META[project.status].description}
          </span>
        </div>
        {project.status === 'cancelled' && project.cancel_reason ? (
          <FormAlert tone="warning" title="Cancelled">
            Reason: {project.cancel_reason}
          </FormAlert>
        ) : null}
        <dl className="grid gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-sm text-muted-foreground">Mix</dt>
            <dd className="font-medium">
              {project.mix_id === null ? 'Not chosen' : `Mix ${project.mix_id}`}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Production start</dt>
            <dd className="font-medium">
              {formatDateTime(project.requested_start_at)}
            </dd>
          </div>
          {BLOCK_SIZE_ORDER.map((size) => (
            <div key={size}>
              <dt className="text-sm text-muted-foreground">
                {BLOCK_SIZES[size].label}
              </dt>
              <dd className="font-medium tabular-nums">
                {formatCount(balance[size].requested)} ordered
              </dd>
              <dd className="text-sm text-muted-foreground tabular-nums">
                {formatCount(balance[size].ready)} ready ·{' '}
                {formatCount(balance[size].collected)} collected
              </dd>
            </div>
          ))}
        </dl>
        {editable || cancellable ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            {editable ? (
              <Link
                to="/projects/$projectId/edit"
                params={{ projectId: String(project.id) }}
                className={buttonVariants({ variant: 'outline' })}
              >
                Edit order
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground sm:self-center">
                Quantities, mix, and production start are locked because
                production has started.
              </p>
            )}
            {cancellable ? <CancelProjectDialog project={project} /> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
