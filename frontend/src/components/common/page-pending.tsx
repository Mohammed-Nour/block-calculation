import { Skeleton } from '@/components/ui';

/** Shown while a route loads its data, so the screen is never blank. */
export function PagePending() {
  return (
    <div role="status" aria-live="polite" className="grid gap-4">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-5 w-80 max-w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
