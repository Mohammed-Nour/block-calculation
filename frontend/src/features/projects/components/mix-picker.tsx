import type { Mix, MixId } from '@/api';
import { Label, RadioGroup, RadioGroupItem } from '@/components/ui';
import { cn } from '@/lib';

interface MixPickerProps {
  mixes: Mix[];
  value: MixId | null;
  error?: string;
  onChange: (mix: MixId) => void;
}

function yieldText(mix: Mix) {
  return mix.full_yield === null && mix.half_yield === null
    ? 'Yields not set in Settings'
    : `${mix.full_yield ?? '—'} full / ${mix.half_yield ?? '—'} half per batch`;
}

/** FR09: one of four mixes. Each card shows its §8.1 recipe and yields. */
export function MixPicker({ mixes, value, error, onChange }: MixPickerProps) {
  return (
    <fieldset
      className="grid gap-2"
      aria-describedby={error ? 'mix-error' : 'mix-hint'}
    >
      <legend className="text-sm font-medium">Mix</legend>
      <p id="mix-hint" className="text-sm text-muted-foreground">
        Required before the cost can be calculated.
      </p>
      <RadioGroup
        value={value === null ? '' : String(value)}
        onValueChange={(next) => onChange(Number(next) as MixId)}
        className="grid gap-2 sm:grid-cols-2"
        aria-invalid={error ? true : undefined}
      >
        {mixes.map((mix) => {
          const id = `mix-option-${mix.id}`;
          return (
            <Label
              key={mix.id}
              htmlFor={id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border bg-card p-3 font-normal transition-colors hover:bg-muted has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent',
                error && 'border-destructive',
              )}
            >
              <RadioGroupItem
                id={id}
                value={String(mix.id)}
                className="mt-0.5"
              />
              <span className="grid gap-0.5">
                <span className="font-medium">{mix.name}</span>
                <span className="text-sm text-muted-foreground">
                  {mix.sand_wheelbarrows} sand · {mix.stone_wheelbarrows} stone
                  · {mix.cement_bags} cement bag
                </span>
                <span className="text-xs text-muted-foreground">
                  {yieldText(mix)}
                </span>
              </span>
            </Label>
          );
        })}
      </RadioGroup>
      {error ? (
        <p id="mix-error" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
