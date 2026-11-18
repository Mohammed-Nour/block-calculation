import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError } from '@/api';
import { memoryStore } from '@/api/mock/db';
import { createMockApi } from '@/api/mock/mock-client';
import { useSaveProject } from '@/features/projects/hooks/mutations/use-save-project';

afterEach(() => vi.restoreAllMocks());

describe('draft persistence when saving an estimate fails', () => {
  it.each([false, true])(
    'reuses the saved draft on retry with existing=%s',
    async (existing) => {
      const input = {
        name: 'Retry order',
        requested_start_at: '2026-11-18T09:00:00+03:00',
        full_quantity: 10,
        half_quantity: 0,
        mix_id: 1 as const,
      };
      const fixture = await createMockApi({
        store: memoryStore(),
      }).createProject(input);
      const detail = {
        ...fixture,
        project: { ...fixture.project, version: existing ? 4 : 1 },
      };
      const create = vi.spyOn(api, 'createProject').mockResolvedValue(detail);
      const update = vi
        .spyOn(api, 'updateProject')
        .mockImplementation(async (_id, values) => ({
          ...detail,
          project: {
            ...detail.project,
            ...values,
            version: values.version + 1,
          },
        }));
      vi.spyOn(api, 'saveEstimate').mockRejectedValueOnce(
        new ApiError(409, 'Calculation settings changed. Calculate again.'),
      );
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
      const { result } = renderHook(() => useSaveProject(), { wrapper });
      const args = {
        input,
        existing: existing ? detail.project : undefined,
        withEstimate: true,
        settingsVersion: 2,
      };
      await act(async () => {
        await expect(result.current.mutateAsync(args)).rejects.toMatchObject({
          status: 409,
        });
      });
      await act(async () => {
        await result.current.mutateAsync({ ...args, withEstimate: false });
      });
      expect(create).toHaveBeenCalledTimes(existing ? 0 : 1);
      expect(update).toHaveBeenCalledTimes(existing ? 2 : 1);
      expect(update).toHaveBeenLastCalledWith(detail.project.id, {
        ...input,
        version: existing ? 5 : 1,
      });
      client.clear();
    },
  );
});
