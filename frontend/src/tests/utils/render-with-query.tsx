import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

/** Render with a fresh QueryClient; `seed` pre-fills query data. */
export function renderWithQuery(
  ui: ReactElement,
  seed: [readonly unknown[], unknown][] = [],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const [key, data] of seed) queryClient.setQueryData(key, data);
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
  };
}
