import { useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { getFieldErrors } from '@/api';
import type { Project } from '@/api';
import { MIX_REQUIRED_MESSAGE } from '@/features/projects/data/settings-field-labels.config';
import { useCalculationPreview } from '@/features/projects/hooks/mutations/use-calculation-preview';
import { useSaveProject } from '@/features/projects/hooks/mutations/use-save-project';
import type {
  ProjectFieldErrors,
  ProjectFormValues,
} from '@/features/projects/types/project-form';
import {
  emptyProjectForm,
  toFormValues,
  toOrder,
  toProjectInput,
  validateProjectForm,
} from '@/features/projects/utils/project-form';

/** Fields whose change invalidates a calculated estimate (FR08). */
const ORDER_FIELDS: (keyof ProjectFormValues)[] = [
  'full_quantity',
  'half_quantity',
  'mix_id',
];

export function useProjectForm(existing?: Project) {
  const navigate = useNavigate();
  const preview = useCalculationPreview();
  const save = useSaveProject();
  const [values, setValues] = useState<ProjectFormValues>(() =>
    existing ? toFormValues(existing) : emptyProjectForm(),
  );
  const [clientErrors, setClientErrors] = useState<ProjectFieldErrors>({});
  const mixGroupRef = useRef<HTMLDivElement>(null);

  const errors: ProjectFieldErrors = {
    ...getFieldErrors(save.error),
    ...clientErrors,
  };

  function setField<TField extends keyof ProjectFormValues>(
    name: TField,
    value: ProjectFormValues[TField],
  ) {
    setValues((current) => ({ ...current, [name]: value }));
    setClientErrors((current) => ({ ...current, [name]: undefined }));
    if (ORDER_FIELDS.includes(name)) preview.reset();
  }

  /** SC01/SC02: no mix or a missing input means no cost is shown. */
  function calculate() {
    const found = validateProjectForm(values);
    if (values.mix_id === null) found.mix_id = MIX_REQUIRED_MESSAGE;
    setClientErrors(found);
    if (found.mix_id) {
      // On a phone the picker is above the fold: take the User to it.
      mixGroupRef.current
        ?.querySelector<HTMLButtonElement>('[role=radio]')
        ?.focus();
    }
    if (found.full_quantity || found.half_quantity || found.mix_id) return;
    preview.mutate(toOrder(values));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateProjectForm(values);
    setClientErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(
      {
        input: toProjectInput(values),
        existing,
        withEstimate: preview.isSuccess,
      },
      {
        onSuccess: (detail) =>
          void navigate({
            to: '/projects/$projectId',
            params: { projectId: String(detail.project.id) },
          }),
      },
    );
  }

  return {
    values,
    errors,
    mixGroupRef,
    hasErrors: Object.values(errors).some(Boolean),
    setField,
    calculate,
    submit,
    preview,
    isSaving: save.isPending,
    saveError: save.error,
    willSaveEstimate: preview.isSuccess,
  };
}
