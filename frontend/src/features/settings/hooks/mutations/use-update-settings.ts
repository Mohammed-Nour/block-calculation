import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, apiKeys } from '@/api';
import type { SettingsUpdate } from '@/api';

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: SettingsUpdate) => api.updateSettings(update),
    onSuccess: (settings) => {
      queryClient.setQueryData(apiKeys.settings(), settings);
      // Project lists show current currency; saved estimates never change.
      void queryClient.invalidateQueries({ queryKey: apiKeys.projects() });
    },
  });
}
