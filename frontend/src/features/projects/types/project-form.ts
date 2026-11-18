import type { MixId } from '@/api';

export interface ProjectFormValues {
  name: string;
  /** datetime-local input value */
  requested_start_at: string;
  full_quantity: string;
  half_quantity: string;
  mix_id: MixId | null;
}

export type ProjectFieldErrors = Partial<
  Record<keyof ProjectFormValues, string>
>;
