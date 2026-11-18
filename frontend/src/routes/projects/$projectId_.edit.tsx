import { createFileRoute, redirect } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';

import { projectQueryOptions, settingsQueryOptions } from '@/api';
import type { ProjectStatus } from '@/api';
import { PageHeader } from '@/components/common';
import { ProjectForm } from '@/features/projects';

const CLOSED_STATUSES: readonly ProjectStatus[] = ['collected', 'cancelled'];

export const Route = createFileRoute('/projects/$projectId_/edit')({
  loader: async ({ context, params }) => {
    const [, detail] = await Promise.all([
      context.queryClient.ensureQueryData(settingsQueryOptions()),
      context.queryClient.ensureQueryData(
        projectQueryOptions(Number(params.projectId)),
      ),
    ]);
    // A closed project has nothing left to edit; show its summary instead.
    if (CLOSED_STATUSES.includes(detail.project.status)) {
      // TanStack Router control flow: `redirect` is thrown by design.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({
        to: '/projects/$projectId',
        params: { projectId: params.projectId },
      });
    }
  },
  component: EditProjectPage,
});

function EditProjectPage() {
  const { projectId } = Route.useParams();
  const { data } = useSuspenseQuery(projectQueryOptions(Number(projectId)));
  return (
    <>
      <PageHeader
        title={`Edit ${data.project.name}`}
        description="Changing quantities or the mix clears the production plan. Saved estimates stay in the history."
      />
      <ProjectForm project={data.project} />
    </>
  );
}
