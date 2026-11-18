import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, apiKeys } from '@/api';
import type { Project } from '@/api';

export function useSaveEstimate(project: Project) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (useCurrentPrices: boolean) =>
      api.saveEstimate(project.id, {
        project_version: project.version,
        use_current_prices: useCurrentPrices,
      }),
    onSuccess: (detail) => {
      queryClient.setQueryData(apiKeys.project(project.id), detail);
      void queryClient.invalidateQueries({ queryKey: apiKeys.projects() });
    },
  });
}
