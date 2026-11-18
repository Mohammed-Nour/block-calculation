import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';

import { ErrorPage, NotFoundPage } from '@/components/errors';
import { Header } from '@/components/header';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: RootLayout,
    errorComponent: ErrorPage,
    notFoundComponent: NotFoundPage,
  },
);

function RootLayout() {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to main content
      </a>
      <Header />
      <main
        id="main"
        tabIndex={-1}
        className="bl-container bl-section outline-none"
      >
        <Outlet />
      </main>
    </>
  );
}
