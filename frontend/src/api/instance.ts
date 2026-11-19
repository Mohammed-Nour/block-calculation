import type { BlockCalcApi } from '@/api/client';
import { createHttpApi } from '@/api/http';
import { browserStore } from '@/api/mock/db';
import { createMockApi } from '@/api/mock/mock-client';

/**
 * The active client. `VITE_API_MODE=http` uses the backend; anything else
 * (the default) uses the in-browser mock so the app runs without a server.
 */
export const api: BlockCalcApi =
  import.meta.env.VITE_API_MODE === 'http'
    ? createHttpApi(
        import.meta.env.VITE_API_BASE_URL || import.meta.env.BASE_URL,
      )
    : createMockApi({ store: browserStore() });
