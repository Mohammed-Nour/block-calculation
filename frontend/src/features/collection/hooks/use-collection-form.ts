import { useState } from 'react';
import type { FormEvent } from 'react';

import { getFieldErrors } from '@/api';
import type { BlockSize, ProjectDetail } from '@/api';
import { useRecordCollection } from '@/features/collection/hooks/mutations/use-record-collection';
import { collectionErrors } from '@/features/collection/utils/collection-balance';
import { newEventKey } from '@/lib';

const EMPTY = { full: '0', half: '0' };

export function useCollectionForm(detail: ProjectDetail) {
  const record = useRecordCollection(detail.project.id);
  const [amounts, setAmounts] = useState<Record<BlockSize, string>>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<BlockSize, string>>>({});
  // One key per collection attempt: a retried submit counts once (FR31).
  const [eventKey, setEventKey] = useState(newEventKey);
  const server = getFieldErrors(record.error);

  function setAmount(size: BlockSize, value: string) {
    setAmounts((current) => ({ ...current, [size]: value }));
    setErrors((current) => ({ ...current, [size]: undefined }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = collectionErrors(amounts, detail.balance);
    setErrors(found);
    if (found.full || found.half) return;
    record.mutate(
      {
        event_key: eventKey,
        full_quantity: Number(amounts.full),
        half_quantity: Number(amounts.half),
        collected_at: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          setAmounts(EMPTY);
          setEventKey(newEventKey());
        },
      },
    );
  }

  return {
    amounts,
    errors: {
      full: errors.full ?? server.full_quantity,
      half: errors.half ?? server.half_quantity,
    },
    setAmount,
    submit,
    isSaving: record.isPending,
    isSaved: record.isSuccess,
    error: record.error,
  };
}
