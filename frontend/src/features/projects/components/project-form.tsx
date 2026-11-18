import { useSuspenseQuery } from '@tanstack/react-query';

import { settingsQueryOptions } from '@/api';
import type { Project } from '@/api';
import { FormAlert, FormField } from '@/components/common';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@/components/ui';
import { BLOCK_SIZES, PROJECT_NAME_MAX_LENGTH } from '@/data';
import { CalculationPanel } from '@/features/projects/components/calculation-panel';
import { MixPicker } from '@/features/projects/components/mix-picker';
import { useProjectForm } from '@/features/projects/hooks/use-project-form';
import { getErrorMessage } from '@/lib';

/** UC02–UC05: enter the order, choose a mix, calculate and save. */
export function ProjectForm({ project }: { project?: Project }) {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions());
  const form = useProjectForm(project);

  return (
    <form
      noValidate
      onSubmit={form.submit}
      className="grid gap-6 lg:grid-cols-[3fr_2fr]"
    >
      <Card>
        <CardHeader>
          <CardTitle>Order</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <FormField
            id="name"
            label="Project name"
            hint={`Up to ${PROJECT_NAME_MAX_LENGTH} characters`}
            error={form.errors.name}
            required
          >
            <Input
              maxLength={PROJECT_NAME_MAX_LENGTH}
              autoComplete="off"
              value={form.values.name}
              onChange={(event) => form.setField('name', event.target.value)}
            />
          </FormField>
          <FormField
            id="requested_start_at"
            label="Production start"
            hint="Used for the completion forecast."
            error={form.errors.requested_start_at}
            required
          >
            <Input
              type="datetime-local"
              value={form.values.requested_start_at}
              onChange={(event) =>
                form.setField('requested_start_at', event.target.value)
              }
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="full_quantity"
              label={BLOCK_SIZES.full.label}
              unit="blocks"
              hint={BLOCK_SIZES.full.dimensions}
              error={form.errors.full_quantity}
              required
            >
              <Input
                inputMode="numeric"
                value={form.values.full_quantity}
                onChange={(event) =>
                  form.setField('full_quantity', event.target.value)
                }
              />
            </FormField>
            <FormField
              id="half_quantity"
              label={BLOCK_SIZES.half.label}
              unit="blocks"
              hint={BLOCK_SIZES.half.dimensions}
              error={form.errors.half_quantity}
              required
            >
              <Input
                inputMode="numeric"
                value={form.values.half_quantity}
                onChange={(event) =>
                  form.setField('half_quantity', event.target.value)
                }
              />
            </FormField>
          </div>
          <MixPicker
            mixes={settings.mixes}
            value={form.values.mix_id}
            error={form.errors.mix_id}
            onChange={(mix) => form.setField('mix_id', mix)}
            groupRef={form.mixGroupRef}
          />
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        <CalculationPanel
          calculation={form.preview.data}
          error={form.preview.error}
          isCalculating={form.preview.isPending}
          onCalculate={form.calculate}
        />
        {form.saveError && !form.hasErrors ? (
          <FormAlert tone="error" title="The save did not finish">
            {getErrorMessage(form.saveError, 'Try again.')}
          </FormAlert>
        ) : null}
        {form.hasErrors ? (
          <FormAlert tone="error" title="Check the highlighted fields">
            Each field shows what to fix.
          </FormAlert>
        ) : null}
        <Button type="submit" size="lg" disabled={form.isSaving}>
          {form.isSaving
            ? 'Saving…'
            : form.willSaveEstimate
              ? 'Save project and estimate'
              : 'Save draft'}
        </Button>
        <p className="text-sm text-muted-foreground">
          {form.willSaveEstimate
            ? 'The estimate is saved with today’s prices and will not change if Settings change.'
            : 'You can save a draft without a mix and calculate the cost later.'}
        </p>
      </div>
    </form>
  );
}
