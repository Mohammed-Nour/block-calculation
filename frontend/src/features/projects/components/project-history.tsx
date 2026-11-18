import type { HistoryEvent } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { formatDateTime } from '@/lib';

/** FR30: every change with its time and User identifier. */
export function ProjectHistory({ events }: { events: HistoryEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 border-l pl-4">
          {events.map((event) => (
            <li key={event.id} className="grid text-sm">
              <span>{event.summary}</span>
              <span className="text-muted-foreground">
                <time dateTime={event.occurred_at}>
                  {formatDateTime(event.occurred_at)}
                </time>{' '}
                · {event.actor_id}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
