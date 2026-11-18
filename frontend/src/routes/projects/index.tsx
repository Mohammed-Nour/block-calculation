import { Link, createFileRoute } from '@tanstack/react-router';

import { projectListQueryOptions } from '@/api';
import { PageHeader } from '@/components/common';
import { buttonVariants } from '@/components/ui';
import { STATUS_FILTER_ALL } from '@/data';
import { ProjectList, StatusFilter } from '@/features/projects';
import { projectListSearchSchema } from '@/schema';

export const Route = createFileRoute('/projects/')({
  validateSearch: projectListSearchSchema,
  loaderDeps: ({ search }) => ({ status: search.status }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      projectListQueryOptions(
        deps.status === STATUS_FILTER_ALL ? undefined : deps.status,
      ),
    ),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { status } = Route.useSearch();
  return (
    <div className="grid gap-4">
      <PageHeader
        title="Projects"
        description="Every order with its status, saved cost and expected ready time."
        actions={
          <Link to="/projects/new" className={buttonVariants()}>
            New project
          </Link>
        }
      />
      <StatusFilter current={status} />
      <ProjectList status={status === STATUS_FILTER_ALL ? undefined : status} />
    </div>
  );
}
