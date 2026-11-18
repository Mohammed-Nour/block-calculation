import { Link } from '@tanstack/react-router';
import { Home } from 'lucide-react';

import { Button } from '@/components/ui';

/**
 * App-wide 404 page rendered by the root route's `notFoundComponent`.
 */
export function NotFoundPage() {
  return (
    <div>
      <div className="bl-container">
        <div
          role="alert"
          className="flex flex-col items-center gap-6 py-24 text-center"
        >
          <p className="text-7xl font-bold text-muted-foreground/20">404</p>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Page not found</h1>
            <p className="text-sm text-muted-foreground">
              The page you&apos;re looking for doesn&apos;t exist.
            </p>
          </div>
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
