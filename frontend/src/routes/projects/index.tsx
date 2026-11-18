import { createFileRoute } from '@tanstack/react-router';

import { PageHeader } from '@/components/common';

export const Route = createFileRoute('/projects/')({
  component: ProjectsPage,
});

function ProjectsPage() {
  return (
    <PageHeader
      title="Projects"
      description="Every saved order with its status, cost and expected ready time."
    />
  );
}
