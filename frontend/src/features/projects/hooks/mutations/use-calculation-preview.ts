import { useMutation } from '@tanstack/react-query';

import { api } from '@/api';
import type { MaterialOrder } from '@/api';

/** UC04: calculate the material estimate with current Settings, saving nothing. */
export function useCalculationPreview() {
  return useMutation({
    mutationFn: (order: MaterialOrder) => api.calculateMaterials(order),
  });
}
