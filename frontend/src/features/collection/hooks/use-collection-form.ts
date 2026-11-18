import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { getFieldErrors } from '@/api';
import type { BlockSize, CollectionInput, ProjectDetail } from '@/api';
import { useRecordCollection } from '@/features/collection/hooks/mutations/use-record-collection';
import { collectionErrors } from '@/features/collection/utils/collection-balance';
import { newEventKey } from '@/lib';

const EMPTY = { full: '0', half: '0' };

export function useCollectionForm(detail: ProjectDetail) {
  const record = useRecordCollection(detail.project.id);
  const [amounts, setAmounts] = useState<Record<BlockSize, string>>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<BlockSize, string>>>({});
  // Keep the entire attempt for retries after an uncertain network outcome (FR31).
  const attempt = useRef<CollectionInput | null>(null);
  const server = getFieldErrors(record.error);

  function setAmount(size: BlockSize, value: string) {
    if (record.isPending) return;
    setAmounts((current) => ({ ...current, [size]: value }));
    setErrors((current) => ({ ...current, [size]: undefined }));
    // Editing begins a new operation with its own key and occurrence time.
    attempt.current = null;
    // Editing starts the next entry: drop the old success or error message.
    record.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (record.isPending) return;
    const found = collectionErrors(amounts, detail.balance);
    setErrors(found);
    if (found.full || found.half) return;
    attempt.current ??= {
      event_key: newEventKey(),
      full_quantity: Number(amounts.full),
      half_quantity: Number(amounts.half),
      collected_at: new Date().toISOString(),
    };
    record.mutate(attempt.current, {
      onSuccess: () => {
        setAmounts(EMPTY);
        attempt.current = null;
      },
    });
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
    /** A failure not tied to one field (conflict, network, server). */
    requestError:
      record.isError && !server.full_quantity && !server.half_quantity
        ? record.error
        : null,
  };
}
