import { Link } from '@tanstack/react-router';

import type { Forecast } from '@/api';
import { FormAlert } from '@/components/common';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { BLOCK_SIZES, BLOCK_SIZE_ORDER, CYCLE_HOURS } from '@/data';
import { formatCount, formatDateTime, formatHours } from '@/lib';

/** UC06, FR19–FR21: expected ready time from the matching mold counts. */
export function ForecastCard({ forecast }: { forecast: Forecast | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Completion forecast</CardTitle>
        <CardDescription>
          Independent forecast: it assumes this project’s molds are free.
          Coordinate molds shared with other projects yourself.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!forecast ? (
          <p className="text-sm text-muted-foreground">No forecast yet.</p>
        ) : (
          <>
            {forecast.untimed_sizes.length > 0 ? (
              <FormAlert tone="warning" title="This order cannot be timed yet">
                No molds are set for{' '}
                {forecast.untimed_sizes
                  .map((size) => BLOCK_SIZES[size].label.toLowerCase())
                  .join(' or ')}
                .{' '}
                <Link
                  to="/settings"
                  className="font-medium text-primary underline"
                >
                  Add molds in Settings
                </Link>
              </FormAlert>
            ) : null}
            <dl className="grid gap-4 sm:grid-cols-3">
              {BLOCK_SIZE_ORDER.map((size) => {
                const item = forecast[size];
                return (
                  <div key={size} className="rounded-md bg-muted p-3">
                    <dt className="text-sm text-muted-foreground">
                      {BLOCK_SIZES[size].label}
                    </dt>
                    <dd className="font-medium tabular-nums">
                      {formatCount(item.cycles)} cycles × {CYCLE_HOURS} h
                    </dd>
                    <dd className="text-sm text-muted-foreground tabular-nums">
                      {formatCount(item.quantity)} blocks ·{' '}
                      {formatCount(item.molds)} molds
                    </dd>
                  </div>
                );
              })}
              <div className="rounded-md bg-accent p-3">
                <dt className="text-sm text-muted-foreground">
                  Expected ready
                </dt>
                <dd className="font-semibold">
                  {formatDateTime(forecast.expected_ready_at)}
                </dd>
                {forecast.duration_hours !== null ? (
                  <dd className="text-sm text-muted-foreground">
                    {formatHours(forecast.duration_hours)} after start
                  </dd>
                ) : null}
              </div>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}
