import { useSuspenseQuery } from '@tanstack/react-query';

import { settingsQueryOptions } from '@/api';
import { FormAlert, FormField } from '@/components/common';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '@/components/ui';
import {
  DECIMAL_HINT,
  MATERIAL_LABELS,
  PRICE_FIELDS,
} from '@/features/settings/data/settings-fields.config';
import { MixYieldsFieldset } from '@/features/settings/components/mix-yields-fieldset';
import { SettingsReadiness } from '@/features/settings/components/settings-readiness';
import { ZeroPriceDialog } from '@/features/settings/components/zero-price-dialog';
import { useSettingsForm } from '@/features/settings/hooks/use-settings-form';
import { getErrorMessage } from '@/lib';

/** UC01: the User submits Settings; the system validates and saves them. */
export function SettingsForm() {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions());
  const form = useSettingsForm(settings);
  const currency =
    form.values.currency.trim().toUpperCase() || settings.currency;

  return (
    <form noValidate onSubmit={form.submit} className="grid gap-6">
      <SettingsReadiness settings={settings} />

      <Card>
        <CardHeader>
          <CardTitle>Material prices</CardTitle>
          <CardDescription>
            Current purchase prices per metric ton. Saved estimates keep the
            prices they were calculated with.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {PRICE_FIELDS.map(({ material, field }) => (
            <FormField
              key={field}
              id={field}
              label={`${MATERIAL_LABELS[material]} price`}
              unit={`${currency} / ton`}
              hint={
                material === 'stone'
                  ? 'Not needed if you only use Mix 1.'
                  : undefined
              }
              error={form.errors[field]}
            >
              <Input
                inputMode="decimal"
                value={form.values[field]}
                onChange={(event) => form.setField(field, event.target.value)}
              />
            </FormField>
          ))}
          <FormField
            id="currency"
            label="Currency"
            hint="A label only: changing it does not convert prices."
            error={form.errors.currency}
            required
          >
            <Input
              className="uppercase"
              maxLength={3}
              autoComplete="off"
              value={form.values.currency}
              onChange={(event) =>
                form.setField('currency', event.target.value)
              }
            />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Measured weights</CardTitle>
          <CardDescription>
            Weigh one full wheelbarrow of each material. Costs cannot be
            calculated without these.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="sand_kg_per_wheelbarrow"
            label="Sand"
            unit="kg / wheelbarrow"
            hint={DECIMAL_HINT}
            error={form.errors.sand_kg_per_wheelbarrow}
          >
            <Input
              inputMode="decimal"
              value={form.values.sand_kg_per_wheelbarrow}
              onChange={(event) =>
                form.setField('sand_kg_per_wheelbarrow', event.target.value)
              }
            />
          </FormField>
          <FormField
            id="stone_kg_per_wheelbarrow"
            label="13 mm stone"
            unit="kg / wheelbarrow"
            hint="Not needed if you only use Mix 1."
            error={form.errors.stone_kg_per_wheelbarrow}
          >
            <Input
              inputMode="decimal"
              value={form.values.stone_kg_per_wheelbarrow}
              onChange={(event) =>
                form.setField('stone_kg_per_wheelbarrow', event.target.value)
              }
            />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Molds</CardTitle>
          <CardDescription>
            One mold makes one block every 48 hours. Full and half molds work in
            parallel.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="full_molds"
            label="Full-block molds"
            unit="molds"
            hint="400 × 200 × 200 mm"
            error={form.errors.full_molds}
            required
          >
            <Input
              inputMode="numeric"
              value={form.values.full_molds}
              onChange={(event) =>
                form.setField('full_molds', event.target.value)
              }
            />
          </FormField>
          <FormField
            id="half_molds"
            label="Half-block molds"
            unit="molds"
            hint="200 × 200 × 200 mm"
            error={form.errors.half_molds}
            required
          >
            <Input
              inputMode="numeric"
              value={form.values.half_molds}
              onChange={(event) =>
                form.setField('half_molds', event.target.value)
              }
            />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mix yields</CardTitle>
          <CardDescription>
            How many blocks one mixing batch makes. Full and half yields are
            separate: two half blocks are not one full block.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MixYieldsFieldset
            mixes={settings.mixes}
            values={form.values.mix_yields}
            errors={form.errors}
            onChange={form.setYield}
          />
        </CardContent>
      </Card>

      {form.isConflict ? (
        <FormAlert tone="error" title="Settings changed somewhere else">
          <p>
            Reload them to see the latest values, then make your change again.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={form.reload}
          >
            Reload settings
          </Button>
        </FormAlert>
      ) : form.error && !form.hasErrors ? (
        <FormAlert tone="error" title="Settings were not saved">
          {getErrorMessage(form.error, 'Try again.')}
        </FormAlert>
      ) : null}
      {form.hasErrors ? (
        <FormAlert tone="error" title="Check the highlighted fields">
          Nothing was saved. Each field shows what to fix.
        </FormAlert>
      ) : null}
      {form.isSaved ? (
        <FormAlert tone="success" title="Settings saved" />
      ) : null}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={form.isSaving}
          className="w-full sm:w-auto"
        >
          {form.isSaving ? 'Saving…' : 'Save settings'}
        </Button>
      </div>

      <ZeroPriceDialog
        materials={form.pendingZero}
        onConfirm={form.confirmZeroPrices}
        onCancel={form.cancelZeroPrices}
      />
    </form>
  );
}
