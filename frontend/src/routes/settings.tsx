import { createFileRoute } from '@tanstack/react-router';

import { PageHeader } from '@/components/common';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <PageHeader
      title="Settings"
      description="Material prices, mold counts, mix yields and measured weights."
    />
  );
}
