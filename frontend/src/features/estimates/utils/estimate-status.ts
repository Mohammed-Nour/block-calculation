import type { EstimateRevision, Project } from '@/api';

/** True when the order or mix changed after this revision was saved. */
export function isEstimateStale(
  project: Project,
  revision: EstimateRevision | undefined,
) {
  if (!revision) return false;
  const { order } = revision.inputs;
  return (
    order.full_quantity !== project.full_quantity ||
    order.half_quantity !== project.half_quantity ||
    order.mix_id !== project.mix_id
  );
}

/** FR18: estimates can be saved only before production starts. */
export function canSaveEstimate(project: Project) {
  return (
    (project.status === 'draft' || project.status === 'planned') &&
    project.mix_id !== null
  );
}
