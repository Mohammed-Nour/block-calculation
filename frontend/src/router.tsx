import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';

import { PagePending } from '@/components/common';

import { routeTree } from './routeTree.gen';

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    basepath: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: PagePending,
    defaultPendingMs: 150,
  });

  return { router, queryClient };
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>['router'];
  }
}
