import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib';

const TONES = {
  error: {
    icon: CircleAlert,
    className: 'border-destructive/40 bg-destructive/5 text-destructive',
  },
  warning: {
    icon: Info,
    className: 'border-warning bg-warning/15 text-warning-foreground',
  },
  success: {
    icon: CircleCheck,
    className: 'border-success/40 bg-success/10 text-success',
  },
} as const;

interface FormAlertProps {
  tone: keyof typeof TONES;
  title: string;
  children?: ReactNode;
}

/** A form-level message. Errors use role="alert" so they are announced. */
export function FormAlert({ tone, title, children }: FormAlertProps) {
  const { icon: Icon, className } = TONES[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-md border p-3 text-sm', className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {children ? <div className="text-foreground">{children}</div> : null}
      </div>
    </div>
  );
}
