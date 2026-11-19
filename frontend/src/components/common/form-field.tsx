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
    className?: string;
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
    <div className={cn('grid content-start gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {/* The box carries the border, so the input keeps the full column width
          whether or not a unit is shown beside it. */}
      <div
        className={cn(
          'flex min-h-10 items-center rounded-md border border-input bg-background transition-colors duration-150 focus-within:ring-2 focus-within:ring-ring has-disabled:cursor-not-allowed has-disabled:opacity-50 motion-reduce:transition-none',
          error && 'border-destructive focus-within:ring-destructive/40',
        )}
      >
        {cloneElement(children, {
          id,
          'aria-describedby': describedBy,
          'aria-invalid': error ? true : undefined,
          required,
          className: cn(
            children.props.className,
            'h-auto self-stretch border-0 bg-transparent shadow-none focus-visible:ring-0 disabled:opacity-100',
          ),
        })}
        {unit ? (
          <span className="shrink-0 pr-3 text-sm whitespace-nowrap text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
      {/* Hint and error share one cell, so showing an error never changes
          the field's height and its neighbours stay aligned. */}
      <div className="grid min-h-5 text-sm *:col-start-1 *:row-start-1">
        {hint ? (
          <p
            id={hintId}
            className={cn(
              'text-muted-foreground transition-opacity duration-150 motion-reduce:transition-none',
              error && 'opacity-0',
            )}
          >
            {hint}
          </p>
        ) : null}
        {error ? (
          <p
            id={errorId}
            className="font-medium text-destructive animate-in fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
