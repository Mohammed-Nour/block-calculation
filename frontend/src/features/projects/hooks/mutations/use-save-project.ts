import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { api, apiKeys } from '@/api';
import type { Project, ProjectDetail, ProjectInput } from '@/api';

interface SaveProjectArgs {
  input: ProjectInput;
  /** The project being edited; absent when creating. */
  existing?: Project;
  /** Also save an estimate revision from the displayed preview (FR15). */
  withEstimate: boolean;
  settingsVersion?: number;
}

/** Create or update a draft, then save an optional estimate revision. */
export function useSaveProject() {
  const queryClient = useQueryClient();
  const persisted = useRef<Project | undefined>(undefined);
  return useMutation({
    mutationFn: async ({
      input,
      existing,
      withEstimate,
      settingsVersion,
    }: SaveProjectArgs) => {
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
          use_current_prices: false,
          settings_version: settingsVersion,
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
