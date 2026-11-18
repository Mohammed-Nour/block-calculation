import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { api, apiKeys } from '@/api';
import type { Project, ProjectDetail, ProjectInput } from '@/api';

interface SaveProjectArgs {
  input: ProjectInput;
  /** The project being edited; absent when creating. */
  existing?: Project;
  /**
   * Also save the displayed estimate (FR15). The preview uses the current
   * Settings, so the revision is saved with those prices.
   */
  withEstimate: boolean;
}

/** Create or update a draft, then save the displayed estimate if there is one. */
export function useSaveProject() {
  const queryClient = useQueryClient();
  // NFR04: once the draft is saved, a retry after a failed estimate updates
  // that draft instead of creating a second project.
  const persisted = useRef<Project | undefined>(undefined);
  return useMutation({
    mutationFn: async ({ input, existing, withEstimate }: SaveProjectArgs) => {
      const current = persisted.current ?? existing;
      let detail: ProjectDetail = current
        ? await api.updateProject(current.id, {
            ...input,
            version: current.version,
          })
        : await api.createProject(input);
      persisted.current = detail.project;
      queryClient.setQueryData(apiKeys.project(detail.project.id), detail);
      void queryClient.invalidateQueries({ queryKey: apiKeys.projects() });
      if (withEstimate) {
        detail = await api.saveEstimate(detail.project.id, {
          project_version: detail.project.version,
          use_current_prices: true,
        });
        persisted.current = detail.project;
      }
      return detail;
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(apiKeys.project(detail.project.id), detail);
      void queryClient.invalidateQueries({ queryKey: apiKeys.projects() });
    },
  });
}
