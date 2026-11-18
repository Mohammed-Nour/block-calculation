import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/api';
import { ApiError } from '@/api/errors';
import { useSaveProject } from '@/features/projects/hooks/mutations/use-save-project';

const input = {
  name: 'Retry wall',
  requested_start_at: '2026-12-01T05:00:00.000Z',
  full_quantity: 10,
  half_quantity: 0,
  mix_id: 2 as const,
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSaveProject', () => {
  it('NFR04: a retry after a failed estimate does not create a second project', async () => {
    vi.spyOn(api, 'saveEstimate').mockRejectedValueOnce(
      new ApiError(503, 'Service unavailable'),
    );
    const { result } = renderHook(() => useSaveProject(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ input, withEstimate: true })
        .catch(() => undefined);
    });
    await act(async () => {
      await result.current.mutateAsync({ input, withEstimate: false });
    });

    const projects = await api.listProjects();
    expect(projects.filter((item) => item.name === 'Retry wall')).toHaveLength(
      1,
    );
  });
});
