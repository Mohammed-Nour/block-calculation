/** A FastAPI-style validation issue: `loc` is the path to the bad field. */
export interface ValidationIssue {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export type ApiErrorDetail =
  | string
  | ValidationIssue[]
  | { message: string; [key: string]: unknown };

/**
 * The error both clients throw, shaped like the backend's responses:
 * 409 `{ detail: { message, current_version } }` for a stale version,
 * 422 `{ detail: [{ loc, msg, type }] }` for invalid fields.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: ApiErrorDetail;

  constructor(status: number, detail: ApiErrorDetail) {
    super(apiErrorMessage(detail));
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

function apiErrorMessage(detail: ApiErrorDetail): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((issue) => issue.msg).join('. ') || 'Invalid input';
  }
  return typeof detail.message === 'string' && detail.message
    ? detail.message
    : 'The request failed';
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function conflictError(message: string, currentVersion: number) {
  return new ApiError(409, { message, current_version: currentVersion });
}

export function validationError(issues: ValidationIssue[]) {
  return new ApiError(422, issues);
}

export function notFoundError(message: string) {
  return new ApiError(404, message);
}

/**
 * Field errors keyed by the last string segment of each issue's `loc`
 * (`['body', 'mix_yields', 0, 'full_yield']` → `mix_yields.0.full_yield`).
 */
export function getFieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error) || !Array.isArray(error.detail)) return {};
  const fields: Record<string, string> = {};
  for (const issue of error.detail) {
    const path = issue.loc.filter((part) => part !== 'body').join('.');
    fields[path] ??= issue.msg;
  }
  return fields;
}
