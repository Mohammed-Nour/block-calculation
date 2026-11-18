import { useState } from 'react';

import type { Project } from '@/api';
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
  Textarea,
} from '@/components/ui';
import { useCancelProject } from '@/features/projects/hooks/mutations/use-cancel-project';
import { getErrorMessage } from '@/lib';

/** UC11: cancel with a reason. Waiting runs stop; active runs and history stay. */
export function CancelProjectDialog({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const cancel = useCancelProject(project);
  const missingReason = touched && !reason.trim();

  function confirm() {
    setTouched(true);
    if (!reason.trim()) return;
    cancel.mutate(reason.trim(), { onSuccess: () => setOpen(false) });
  }

  /** Closing the dialog drops the draft reason and any old error. */
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setReason('');
      setTouched(false);
      cancel.reset();
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Cancel project</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel “{project.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Runs that have not started are stopped. Runs already in the molds
            stay tracked until ready, ready blocks can still be collected, and
            the history is kept.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormField
          id="cancel-reason"
          label="Reason"
          required
          error={
            missingReason
              ? 'Enter a reason for cancelling'
              : cancel.error
                ? getErrorMessage(
                    cancel.error,
                    'The project was not cancelled.',
                  )
                : undefined
          }
        >
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep project</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={confirm}
            disabled={cancel.isPending}
          >
            {cancel.isPending ? 'Cancelling…' : 'Cancel project'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
