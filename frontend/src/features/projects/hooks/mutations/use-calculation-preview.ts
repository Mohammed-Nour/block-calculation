import { useMutation } from '@tanstack/react-query';

import { api } from '@/api';
import type { CalculationInput } from '@/api';

/** UC04: calculate material costs for a new or existing draft. */
export function useCalculationPreview() {
  return useMutation({
    mutationFn: (order: CalculationInput) => api.calculateMaterials(order),
  });
}
