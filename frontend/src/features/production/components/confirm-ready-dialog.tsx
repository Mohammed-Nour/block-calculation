import { useState } from 'react';

import type { ProductionRun } from '@/api';
import { FormField } from '@/components/common';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Checkbox,
  Input,
  Label,
} from '@/components/ui';
import { BLOCK_SIZES, CYCLE_HOURS } from '@/data';
import { useConfirmRunReady } from '@/features/production/hooks/mutations/use-run-actions';
import { earliestReadyAt } from '@/features/production/utils/run-state';
import {
  formatDateTime,
  fromDateTimeInput,
  getErrorMessage,
  newEventKey,
  toDateTimeInput,
} from '@/lib';

interface ConfirmReadyDialogProps {
  projectId: number;
  run: ProductionRun;
}

function ConfirmReadyForm({
  projectId,
  run,
  onDone,
}: ConfirmReadyDialogProps & { onDone: () => void }) {
  const [eventKey] = useState(newEventKey);
  const [readyAt, setReadyAt] = useState(() =>
    toDateTimeInput(new Date().toISOString()),
  );
  const [checked, setChecked] = useState(false);
  const confirm = useConfirmRunReady(projectId, run.id);
  const earliest = earliestReadyAt(run);

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Confirm these blocks are ready?</AlertDialogTitle>
        <AlertDialogDescription>
          {run.quantity} {BLOCK_SIZES[run.block_size].label.toLowerCase()}{' '}
          started {formatDateTime(run.started_at)}. A run can be confirmed{' '}
          {CYCLE_HOURS} hours after it started, from {formatDateTime(earliest)}.
          If they are not ready, close this and the forecast moves on its own.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <FormField
        id={`run-${run.id}-ready`}
        label="Ready at"
        error={
          confirm.error
            ? getErrorMessage(confirm.error, 'Not confirmed.')
            : undefined
        }
      >
        <Input
          type="datetime-local"
          value={readyAt}
          onChange={(event) => setReadyAt(event.target.value)}
        />
      </FormField>
      <div className="flex items-start gap-3">
        <Checkbox
          id={`run-${run.id}-checked`}
          checked={checked}
          onCheckedChange={(value) => setChecked(value === true)}
        />
        <Label
          htmlFor={`run-${run.id}-checked`}
          className="font-normal leading-snug"
        >
          I checked the blocks on site and they are cured and ready.
        </Label>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>Not ready yet</AlertDialogCancel>
        <Button
          disabled={!checked || confirm.isPending || !readyAt}
          onClick={() =>
            confirm.mutate(
              {
                event_key: eventKey,
                ready_at: fromDateTimeInput(readyAt),
                physically_checked: checked,
              },
              { onSuccess: onDone },
            )
          }
        >
          {confirm.isPending ? 'Saving…' : 'Confirm ready'}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

/** UC08 and SC05: ready only after 48 hours and a physical check. */
export function ConfirmReadyDialog({
  projectId,
  run,
}: ConfirmReadyDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="secondary">
          Confirm ready
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        {open ? (
          <ConfirmReadyForm
            projectId={projectId}
            run={run}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
