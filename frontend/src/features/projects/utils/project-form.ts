import type { MaterialOrder, Project, ProjectInput } from '@/api';
import { projectFormSchema } from '@/features/projects/schema/project-form-schema';
import type {
  ProjectFieldErrors,
  ProjectFormValues,
} from '@/features/projects/types/project-form';
import { fromDateTimeInput, toDateTimeInput } from '@/lib';
import { MS_PER_HOUR } from '@/data';

/** Next whole hour, a sensible default start. */
export function defaultStart(now = new Date()) {
  const next = new Date(Math.ceil(now.getTime() / MS_PER_HOUR) * MS_PER_HOUR);
  return toDateTimeInput(next.toISOString());
}

export function emptyProjectForm(now?: Date): ProjectFormValues {
  return {
    name: '',
    requested_start_at: defaultStart(now),
    full_quantity: '0',
    half_quantity: '0',
    mix_id: null,
  };
}

export function toFormValues(project: Project): ProjectFormValues {
  return {
    name: project.name,
    requested_start_at: toDateTimeInput(project.requested_start_at),
    full_quantity: String(project.full_quantity),
    half_quantity: String(project.half_quantity),
    mix_id: project.mix_id,
  };
}

export function validateProjectForm(
  values: ProjectFormValues,
): ProjectFieldErrors {
  const result = projectFormSchema.safeParse(values);
  if (result.success) return {};
  const errors: ProjectFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof ProjectFormValues;
    errors[field] ??= issue.message;
  }
  return errors;
}

export function toProjectInput(values: ProjectFormValues): ProjectInput {
  return {
    name: values.name.trim(),
    requested_start_at: fromDateTimeInput(values.requested_start_at),
    full_quantity: Number(values.full_quantity),
    half_quantity: Number(values.half_quantity),
    mix_id: values.mix_id,
  };
}

export function toOrder(values: ProjectFormValues): MaterialOrder {
  return {
    full_quantity: Number(values.full_quantity),
    half_quantity: Number(values.half_quantity),
    mix_id: values.mix_id,
  };
}

/** Missing calculation inputs from field issues or legacy error responses. */
export function missingFields(error: unknown): string[] {
  if (
    error instanceof Error &&
    'detail' in error &&
    Array.isArray(error.detail)
  ) {
    return error.detail
      .filter(
        (issue: unknown): issue is { type: string; loc: (string | number)[] } =>
          typeof issue === 'object' &&
          issue !== null &&
          'type' in issue &&
          issue.type === 'value_error.missing_calculation_input' &&
          'loc' in issue &&
          Array.isArray(issue.loc),
      )
      .map((issue) => issue.loc.at(-1))
      .filter((field): field is string => typeof field === 'string');
  }
  if (
    error instanceof Error &&
    'detail' in error &&
    typeof error.detail === 'object' &&
    error.detail !== null &&
    'missing_fields' in error.detail &&
    Array.isArray(error.detail.missing_fields)
  ) {
    return error.detail.missing_fields.filter(
      (field): field is string => typeof field === 'string',
    );
  }
  return [];
}
