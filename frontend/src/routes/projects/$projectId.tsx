import { createFileRoute, notFound } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';

import { isApiError, projectQueryOptions } from '@/api';
import { PageHeader } from '@/components/common';
import { CollectionSection } from '@/features/collection';
import { EstimateSection } from '@/features/estimates';
import { ProductionSection } from '@/features/production';
import { ProjectHistory, ProjectOverview } from '@/features/projects';

export const Route = createFileRoute('/projects/$projectId')({
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(
        projectQueryOptions(Number(params.projectId)),
      );
    } catch (error) {
      // TanStack Router control flow: `notFound` is thrown by design.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      if (isApiError(error) && error.status === 404) throw notFound();
      throw error;
    }
  },
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { data } = useSuspenseQuery(projectQueryOptions(Number(projectId)));
  return (
    <div className="grid gap-6">
      <PageHeader title={data.project.name} />
      <ProjectOverview detail={data} />
      <EstimateSection detail={data} />
      <ProductionSection detail={data} />
      {data.runs.length > 0 ? <CollectionSection detail={data} /> : null}
      <ProjectHistory events={data.history} />
    </div>
  );
}
