import { createFileRoute } from '@tanstack/react-router';

import { settingsQueryOptions } from '@/api';
import { PageHeader } from '@/components/common';
import { SettingsForm } from '@/features/settings';

export const Route = createFileRoute('/settings')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(settingsQueryOptions()),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Material prices, measured weights, molds and mix yields used by every new estimate."
      />
      <SettingsForm />
    </>
  );
}
