import { createFileRoute } from '@tanstack/react-router';

import { PageHeader } from '@/components/common';

export const Route = createFileRoute('/projects/new')({
  component: NewProjectPage,
});

function NewProjectPage() {
  return (
    <PageHeader
      title="New project"
      description="Enter the order, choose a mix and calculate its material cost."
    />
  );
}
