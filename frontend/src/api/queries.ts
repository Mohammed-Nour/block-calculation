import { queryOptions } from '@tanstack/react-query';

import { api } from '@/api/instance';
import type { ProjectStatus } from '@/api/types';

/**
 * Query keys and options for every API read, shared by all features the way
 * generated API hooks would be. Mutations invalidate through these keys.
 */
export const apiKeys = {
  all: ['api'] as const,
  settings: () => [...apiKeys.all, 'settings'] as const,
  projects: () => [...apiKeys.all, 'projects'] as const,
  projectList: (status?: ProjectStatus) =>
    [...apiKeys.projects(), 'list', status ?? 'all'] as const,
  project: (id: number) => [...apiKeys.projects(), 'detail', id] as const,
};

export const settingsQueryOptions = () =>
  queryOptions({
    queryKey: apiKeys.settings(),
    queryFn: () => api.getSettings(),
  });

export const projectListQueryOptions = (status?: ProjectStatus) =>
  queryOptions({
    queryKey: apiKeys.projectList(status),
    queryFn: () => api.listProjects(status),
  });

export const projectQueryOptions = (id: number) =>
  queryOptions({
    queryKey: apiKeys.project(id),
    queryFn: () => api.getProject(id),
  });
