import { createFileRoute, notFound } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';

import { isApiError, projectQueryOptions } from '@/api';
import { PageHeader } from '@/components/common';
import { EstimateSection } from '@/features/estimates';

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
      <PageHeader
        title={data.project.name}
        description={`Status: ${data.project.status}`}
      />
      <EstimateSection detail={data} />
    </div>
  );
}
