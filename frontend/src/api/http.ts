import axios, { isAxiosError } from 'axios';

import type { BlockCalcApi } from '@/api/client';
import { ApiError } from '@/api/errors';
import type { ApiErrorDetail } from '@/api/errors';

const TIMEOUT_MS = 10_000;

/** Turn an axios failure into the same `ApiError` the mock throws. */
function toApiError(error: unknown): never {
  if (isAxiosError(error) && error.response) {
    const body = error.response.data as { detail?: ApiErrorDetail } | undefined;
    throw new ApiError(error.response.status, body?.detail ?? error.message);
  }
  throw error instanceof Error ? error : new Error(String(error));
}

/** Calls the FastAPI backend at `baseURL` (docs/api/README.md). */
export function createHttpApi(baseURL: string): BlockCalcApi {
  const http = axios.create({
    baseURL,
    timeout: TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
  });

  async function call<T>(request: Promise<{ data: T }>): Promise<T> {
    try {
      return (await request).data;
    } catch (error) {
      return toApiError(error);
    }
  }

  return {
    getSettings: () => call(http.get('/api/settings')),
    updateSettings: (update) => call(http.put('/api/settings', update)),
    calculateMaterials: (order) => call(http.post('/api/calculations', order)),
    listProjects: (status) =>
      call(http.get('/api/projects', { params: status ? { status } : {} })),
    getProject: (id) => call(http.get(`/api/projects/${id}`)),
    createProject: (input) => call(http.post('/api/projects', input)),
    updateProject: (id, input) => call(http.put(`/api/projects/${id}`, input)),
    saveEstimate: (id, input) =>
      call(http.post(`/api/projects/${id}/estimates`, input)),
    planProduction: (id, input) =>
      call(http.post(`/api/projects/${id}/plan`, input)),
    startRun: (id, runId, input) =>
      call(http.post(`/api/projects/${id}/runs/${runId}/start`, input)),
    confirmRunReady: (id, runId, input) =>
      call(http.post(`/api/projects/${id}/runs/${runId}/ready`, input)),
    recordCollection: (id, input) =>
      call(http.post(`/api/projects/${id}/collections`, input)),
    cancelProject: (id, input) =>
      call(http.post(`/api/projects/${id}/cancel`, input)),
  };
}
