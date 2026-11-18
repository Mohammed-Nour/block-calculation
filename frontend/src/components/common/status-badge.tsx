import type { ProjectStatus } from '@/api';
import { Badge } from '@/components/ui';
import { PROJECT_STATUS_META } from '@/data';

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const meta = PROJECT_STATUS_META[status];
  return <Badge variant={meta.tone}>{meta.label}</Badge>;
}
