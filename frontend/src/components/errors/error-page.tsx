import type { ErrorComponentProps } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { Home, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui';

/**
 * App-wide error boundary page rendered by the root route's `errorComponent`.
 * Shows the raw error message in development only.
 */
export function ErrorPage({ error }: ErrorComponentProps) {
  return (
    <div>
      <div className="bl-container">
        <div
          role="alert"
          className="flex flex-col items-center gap-6 py-24 text-center"
        >
          <div className="rounded-full bg-muted p-4">
            <TriangleAlert className="size-8 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. Please try again.
            </p>
          </div>
          {import.meta.env.DEV ? (
            <pre className="max-w-full overflow-x-auto rounded-md bg-muted px-4 py-2 text-left text-xs text-muted-foreground">
              {error instanceof Error ? error.message : String(error)}
            </pre>
          ) : null}
          <Button variant="outline" asChild>
            <Link to="/">
              <Home className="size-4" />
              Go home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
