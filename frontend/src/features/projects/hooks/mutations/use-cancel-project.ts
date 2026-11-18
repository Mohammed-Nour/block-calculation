import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, apiKeys } from '@/api';
import type { Project } from '@/api';

export function useCancelProject(project: Project) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      api.cancelProject(project.id, {
        project_version: project.version,
        reason,
      }),
    onSuccess: (detail) => {
      queryClient.setQueryData(apiKeys.project(project.id), detail);
      void queryClient.invalidateQueries({ queryKey: apiKeys.projects() });
    },
  });
}
