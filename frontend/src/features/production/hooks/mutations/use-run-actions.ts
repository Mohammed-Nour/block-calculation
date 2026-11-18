import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, apiKeys } from '@/api';
import type { ProjectDetail, RunReady, RunStart } from '@/api';

function useStoreDetail(projectId: number) {
  const queryClient = useQueryClient();
  return (detail: ProjectDetail) => {
    queryClient.setQueryData(apiKeys.project(projectId), detail);
    void queryClient.invalidateQueries({ queryKey: apiKeys.projects() });
  };
}

export function usePlanProduction(projectId: number, version: number) {
  const store = useStoreDetail(projectId);
  return useMutation({
    mutationFn: () =>
      api.planProduction(projectId, { project_version: version }),
    onSuccess: store,
  });
}

export function useStartRun(projectId: number, runId: number) {
  const store = useStoreDetail(projectId);
  return useMutation({
    mutationFn: (input: RunStart) => api.startRun(projectId, runId, input),
    onSuccess: store,
  });
}

export function useConfirmRunReady(projectId: number, runId: number) {
  const store = useStoreDetail(projectId);
  return useMutation({
    mutationFn: (input: RunReady) =>
      api.confirmRunReady(projectId, runId, input),
    onSuccess: store,
  });
}
