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
  Input,
} from '@/components/ui';
import { BLOCK_SIZES } from '@/data';
import { useStartRun } from '@/features/production/hooks/mutations/use-run-actions';
import {
  fromDateTimeInput,
  getErrorMessage,
  newEventKey,
  toDateTimeInput,
} from '@/lib';

interface StartRunDialogProps {
  projectId: number;
  run: ProductionRun;
}

/** Mounted only while the dialog is open, so each opening gets one event key. */
function StartRunForm({
  projectId,
  run,
  onDone,
}: StartRunDialogProps & { onDone: () => void }) {
  const [eventKey] = useState(newEventKey);
  const [startedAt, setStartedAt] = useState(() =>
    toDateTimeInput(new Date().toISOString()),
  );
  const start = useStartRun(projectId, run.id);

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Start this run?</AlertDialogTitle>
        <AlertDialogDescription>
          {run.quantity} {BLOCK_SIZES[run.block_size].label.toLowerCase()} go
          into {run.quantity} of the {run.mold_capacity} molds. Record when they
          actually went in.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <FormField
        id={`run-${run.id}-start`}
        label="Started at"
        error={
          start.error
            ? getErrorMessage(start.error, 'The run was not started.')
            : undefined
        }
      >
        <Input
          type="datetime-local"
          value={startedAt}
          onChange={(event) => setStartedAt(event.target.value)}
        />
      </FormField>
      <AlertDialogFooter>
        <AlertDialogCancel>Not yet</AlertDialogCancel>
        <Button
          disabled={start.isPending || !startedAt}
          onClick={() =>
            start.mutate(
              { event_key: eventKey, started_at: fromDateTimeInput(startedAt) },
              { onSuccess: onDone },
            )
          }
        >
          {start.isPending ? 'Saving…' : 'Start run'}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

/** UC07: record a run's actual start. */
export function StartRunDialog({ projectId, run }: StartRunDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm">Start</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        {open ? (
          <StartRunForm
            projectId={projectId}
            run={run}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
