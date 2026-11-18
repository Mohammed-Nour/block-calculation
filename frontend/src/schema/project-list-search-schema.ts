import { z } from 'zod';

import { PROJECT_STATUSES } from '@/api/types';
import { STATUS_FILTER_ALL } from '@/data';

/** `/projects?status=` — an unknown value falls back to all projects. */
export const projectListSearchSchema = z.object({
  status: z
    .enum([STATUS_FILTER_ALL, ...PROJECT_STATUSES])
    .default(STATUS_FILTER_ALL)
    .catch(STATUS_FILTER_ALL),
});

export type ProjectListSearch = z.infer<typeof projectListSearchSchema>;
