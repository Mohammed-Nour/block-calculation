import type { ProjectDetail } from '@/api';
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
import { BLOCK_SIZES, BLOCK_SIZE_ORDER } from '@/data';
import { useCollectionForm } from '@/features/collection/hooks/use-collection-form';
import { collectable } from '@/features/collection/utils/collection-balance';
import { formatCount, formatDateTime, getErrorMessage } from '@/lib';

/** UC09: record partial collections within the ready balance (FR25, FR26). */
export function CollectionSection({ detail }: { detail: ProjectDetail }) {
  const form = useCollectionForm(detail);
  const { balance, collections, project } = detail;
  const anyCollectable = BLOCK_SIZE_ORDER.some(
    (size) => collectable(balance[size]) > 0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Collection</CardTitle>
        <CardDescription>
          Record blocks the customer takes away. Only ready blocks can be
          collected.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <dl className="grid gap-3 sm:grid-cols-2">
          {BLOCK_SIZE_ORDER.map((size) => (
            <div key={size} className="rounded-md bg-muted p-3">
              <dt className="text-sm text-muted-foreground">
                {BLOCK_SIZES[size].label}
              </dt>
              <dd className="font-medium tabular-nums">
                {formatCount(collectable(balance[size]))} ready to collect
              </dd>
              <dd className="text-sm text-muted-foreground tabular-nums">
                {formatCount(balance[size].collected)} of{' '}
                {formatCount(balance[size].requested)} collected
              </dd>
            </div>
          ))}
        </dl>

        {project.status === 'collected' ? (
          <FormAlert
            tone="success"
            title="The whole order has been collected"
          />
        ) : anyCollectable ? (
          <form noValidate onSubmit={form.submit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {BLOCK_SIZE_ORDER.map((size) => (
                <FormField
                  key={size}
                  id={`collect-${size}`}
                  label={`${BLOCK_SIZES[size].label} collected now`}
                  unit="blocks"
                  hint={`Up to ${formatCount(collectable(balance[size]))}`}
                  error={form.errors[size]}
                >
                  <Input
                    type="number"
                    min={0}
                    max={collectable(balance[size])}
                    step={1}
                    disabled={form.isSaving}
                    inputMode="numeric"
                    value={form.amounts[size]}
                    onChange={(event) =>
                      form.setAmount(size, event.target.value)
                    }
                  />
                </FormField>
              ))}
            </div>
            {form.requestError ? (
              <FormAlert tone="error" title="The collection was not recorded">
                {getErrorMessage(form.requestError, 'Try again.')}
              </FormAlert>
            ) : null}
            {form.isSaved ? (
              <FormAlert tone="success" title="Collection recorded" />
            ) : null}
            <Button
              type="submit"
              disabled={form.isSaving}
              className="w-full sm:w-auto sm:justify-self-start"
            >
              {form.isSaving ? 'Saving…' : 'Record collection'}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing is ready to collect yet. Confirm runs as ready first.
          </p>
        )}

        {collections.length > 0 ? (
          <ul className="grid gap-1 text-sm">
            {collections.map((item) => (
              <li key={item.id} className="flex justify-between gap-4">
                <span>{formatDateTime(item.collected_at)}</span>
                <span className="tabular-nums">
                  {formatCount(item.full_quantity)} full ·{' '}
                  {formatCount(item.half_quantity)} half
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
