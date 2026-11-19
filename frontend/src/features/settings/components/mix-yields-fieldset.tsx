import type { Mix } from '@/api';
import { FormField } from '@/components/common';
import { Input } from '@/components/ui';
import type {
  SettingsFieldErrors,
  SettingsFormValues,
} from '@/features/settings/types/settings-form';
import { recipeSummary } from '@/features/settings/utils/settings-form';

interface MixYieldsFieldsetProps {
  mixes: Mix[];
  values: SettingsFormValues['mix_yields'];
  errors: SettingsFieldErrors;
  onChange: (
    index: number,
    size: 'full_yield' | 'half_yield',
    value: string,
  ) => void;
}

/** FR04: a separate full and half yield for every mix. */
export function MixYieldsFieldset({
  mixes,
  values,
  errors,
  onChange,
}: MixYieldsFieldsetProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {mixes.map((mix, index) => {
        const value = values[index];
        if (!value) return null;
        return (
          <fieldset
            key={mix.id}
            className="grid content-start gap-3 rounded-md border p-4"
          >
            <legend className="px-1 font-medium">{mix.name}</legend>
            <p className="text-sm text-muted-foreground">
              {recipeSummary(mix)}
            </p>
            <div className="grid gap-3">
              <FormField
                id={`mix-${mix.id}-full`}
                label="Full yield"
                unit="blocks / batch"
                error={errors[`mix_yields.${index}.full_yield`]}
              >
                <Input
                  inputMode="numeric"
                  value={value.full_yield}
                  onChange={(event) =>
                    onChange(index, 'full_yield', event.target.value)
                  }
                />
              </FormField>
              <FormField
                id={`mix-${mix.id}-half`}
                label="Half yield"
                unit="blocks / batch"
                error={errors[`mix_yields.${index}.half_yield`]}
              >
                <Input
                  inputMode="numeric"
                  value={value.half_yield}
                  onChange={(event) =>
                    onChange(index, 'half_yield', event.target.value)
                  }
                />
              </FormField>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
