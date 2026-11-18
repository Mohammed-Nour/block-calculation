import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';

import { projectQueryOptions, settingsQueryOptions } from '@/api';
import { PageHeader } from '@/components/common';
import { ProjectForm } from '@/features/projects';

export const Route = createFileRoute('/projects/$projectId_/edit')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(settingsQueryOptions()),
      context.queryClient.ensureQueryData(
        projectQueryOptions(Number(params.projectId)),
      ),
    ]),
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
