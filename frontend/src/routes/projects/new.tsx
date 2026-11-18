import { createFileRoute } from '@tanstack/react-router';

import { settingsQueryOptions } from '@/api';
import { PageHeader } from '@/components/common';
import { ProjectForm } from '@/features/projects';

export const Route = createFileRoute('/projects/new')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(settingsQueryOptions()),
  component: NewProjectPage,
});

function NewProjectPage() {
  return (
    <>
      <PageHeader
        title="New project"
        description="Enter the order, choose a mix and calculate its material cost."
      />
      <ProjectForm />
    </>
  );
}
