import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, apiKeys } from '@/api';
import type { CollectionInput } from '@/api';

export function useRecordCollection(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CollectionInput) =>
      api.recordCollection(projectId, input),
    onSuccess: (detail) => {
      queryClient.setQueryData(apiKeys.project(projectId), detail);
      void queryClient.invalidateQueries({ queryKey: apiKeys.projects() });
    },
  });
}
