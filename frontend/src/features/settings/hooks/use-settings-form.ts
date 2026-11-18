import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiKeys, getFieldErrors, isApiError } from '@/api';
import type { Material, Settings } from '@/api';
import { useUpdateSettings } from '@/features/settings/hooks/mutations/use-update-settings';
import type {
  SettingsFieldErrors,
  SettingsFormValues,
} from '@/features/settings/types/settings-form';
import {
  newZeroPrices,
  toFormValues,
  toSettingsUpdate,
  validateSettingsForm,
} from '@/features/settings/utils/settings-form';

type FieldName = Exclude<keyof SettingsFormValues, 'mix_yields'>;

/** Form state, validation, zero-price confirmation and save for Settings. */
export function useSettingsForm(settings: Settings) {
  const queryClient = useQueryClient();
  const mutation = useUpdateSettings();
  const [values, setValues] = useState(() => toFormValues(settings));
  const [baseVersion, setBaseVersion] = useState(settings.version);
  const [clientErrors, setClientErrors] = useState<SettingsFieldErrors>({});
  const [pendingZero, setPendingZero] = useState<Material[]>([]);

  // New data from the server (after a save or reload) resets the form.
  if (settings.version !== baseVersion) {
    setBaseVersion(settings.version);
    setValues(toFormValues(settings));
  }

  const errors: SettingsFieldErrors = {
    ...getFieldErrors(mutation.error),
    ...clientErrors,
  };
  const isConflict =
    isApiError(mutation.error) && mutation.error.status === 409;

  function setField(name: FieldName, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setClientErrors((current) => ({ ...current, [name]: undefined }));
  }

  function setYield(
    index: number,
    size: 'full_yield' | 'half_yield',
    value: string,
  ) {
    setValues((current) => ({
      ...current,
      mix_yields: current.mix_yields.map((mix, i) =>
        i === index ? { ...mix, [size]: value } : mix,
      ),
    }));
    setClientErrors((current) => ({
      ...current,
      [`mix_yields.${index}.${size}`]: undefined,
    }));
  }

  function save(confirmed: Material[]) {
    mutation.mutate(toSettingsUpdate(values, settings.version, confirmed));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.reset();
    const found = validateSettingsForm(values);
    setClientErrors(found);
    if (Object.keys(found).length > 0) return;
    const zeros = newZeroPrices(values, settings);
    if (zeros.length > 0) {
      setPendingZero(zeros);
      return;
    }
    save([]);
  }

  function confirmZeroPrices() {
    save(pendingZero);
    setPendingZero([]);
  }

  function reload() {
    mutation.reset();
    void queryClient.invalidateQueries({ queryKey: apiKeys.settings() });
  }

  return {
    values,
    errors,
    hasErrors: Object.values(errors).some(Boolean),
    setField,
    setYield,
    submit,
    pendingZero,
    confirmZeroPrices,
    cancelZeroPrices: () => setPendingZero([]),
    isSaving: mutation.isPending,
    isSaved: mutation.isSuccess,
    isConflict,
    error: mutation.error,
    reload,
  };
}
