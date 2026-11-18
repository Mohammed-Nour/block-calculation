import { Link } from '@tanstack/react-router';

import { PROJECT_STATUSES } from '@/api';
import { PROJECT_STATUS_META, STATUS_FILTER_ALL } from '@/data';
import type { ProjectListSearch } from '@/schema';
import { cn } from '@/lib';

const OPTIONS = [
  { value: STATUS_FILTER_ALL, label: 'All' },
  ...PROJECT_STATUSES.map((status) => ({
    value: status,
    label: PROJECT_STATUS_META[status].label,
  })),
] as const;

/** FR27: filter by status. Each option is a link, so the filter is shareable. */
export function StatusFilter({
  current,
}: {
  current: ProjectListSearch['status'];
}) {
  return (
    <nav
      aria-label="Filter projects by status"
      className="-mx-1 overflow-x-auto pb-1"
    >
      <ul className="flex gap-1 px-1">
        {OPTIONS.map((option) => {
          const active = option.value === current;
          return (
            <li key={option.value}>
              <Link
                to="/projects"
                search={{ status: option.value }}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 items-center rounded-full border px-3 text-sm whitespace-nowrap transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-muted',
                )}
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
