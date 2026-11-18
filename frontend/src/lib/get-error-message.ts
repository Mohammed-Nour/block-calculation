import { isAxiosError } from 'axios';

import { isApiError } from '@/api/errors';

/**
 * Best-effort extraction (API errors first) of a human-readable message from an unknown error.
 * On Axios errors it prefers the server body: the backend's `ApiError` shape
 * (`{ detail, code, suggestion }`), then FastAPI's object detail
 * (`HTTPException(detail={ message, … })`), then a generic `{ message }`.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    return error.message;
  }
  if (isAxiosError(error)) {
    const data: unknown = error.response?.data;
    if (data && typeof data === 'object') {
      const record = data as { detail?: unknown; message?: unknown };
      if (typeof record.detail === 'string') {
        return record.detail;
      }
      const detail = record.detail as { message?: unknown } | null | undefined;
      if (
        detail &&
        typeof detail === 'object' &&
        typeof detail.message === 'string'
      ) {
        return detail.message;
      }
      if (typeof record.message === 'string') {
        return record.message;
      }
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
