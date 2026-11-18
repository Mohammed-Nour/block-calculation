import { Link } from '@tanstack/react-router';

import { APP_NAME } from '@/data';

export function Logo() {
  return (
    <Link
      to="/projects"
      className="flex items-center gap-2 rounded-md text-lg font-bold tracking-tight text-foreground"
    >
      <span
        aria-hidden="true"
        className="grid size-6 rotate-45 grid-cols-2 gap-0.5"
      >
        <span className="bg-brand" />
        <span className="bg-primary" />
        <span className="bg-primary" />
        <span className="bg-brand" />
      </span>
      {APP_NAME}
    </Link>
  );
}
