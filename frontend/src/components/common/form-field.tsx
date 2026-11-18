import type { ReactElement } from 'react';
import { cloneElement } from 'react';

import { Label } from '@/components/ui';
import { cn } from '@/lib';

interface FormFieldProps {
  id: string;
  label: string;
  /** Unit shown beside the input, e.g. "RUB / ton" (NFR02). */
  unit?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactElement<{
    id?: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    required?: boolean;
  }>;
}

/**
 * Label, input, unit, hint and error in one block. The error and hint are
 * linked to the input through `aria-describedby`, and the input is marked
 * `aria-invalid`, so screen readers announce them with the field.
 */
export function FormField({
  id,
  label,
  unit,
  hint,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </Label>
      <div className="flex items-center gap-2">
        {cloneElement(children, {
          id,
          'aria-describedby': describedBy,
          'aria-invalid': error ? true : undefined,
          required,
        })}
        {unit ? (
          <span className="shrink-0 text-sm whitespace-nowrap text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
