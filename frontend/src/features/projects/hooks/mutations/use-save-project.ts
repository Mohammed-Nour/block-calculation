import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, apiKeys } from '@/api';
import type { Project, ProjectDetail, ProjectInput } from '@/api';

interface SaveProjectArgs {
  input: ProjectInput;
  /** The project being edited; absent when creating. */
  existing?: Project;
  /** Also save an estimate revision with the current prices (FR15). */
  withEstimate: boolean;
}

/** Create or update a draft, optionally saving its estimate in the same step. */
export function useSaveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, existing, withEstimate }: SaveProjectArgs) => {
      let detail: ProjectDetail = existing
        ? await api.updateProject(existing.id, {
            ...input,
            version: existing.version,
          })
        : await api.createProject(input);
      if (withEstimate) {
        detail = await api.saveEstimate(detail.project.id, {
          project_version: detail.project.version,
          use_current_prices: false,
        });
      }
      return detail;
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(apiKeys.project(detail.project.id), detail);
      void queryClient.invalidateQueries({ queryKey: apiKeys.projects() });
    },
  });
}
