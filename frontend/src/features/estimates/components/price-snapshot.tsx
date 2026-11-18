import type { EstimateRevision } from '@/api';
import { formatDateTime, formatMoney } from '@/lib';

/** FR15–FR16: the inputs a saved estimate used, which Settings changes never alter. */
export function PriceSnapshot({ revision }: { revision: EstimateRevision }) {
  const { settings, mix } = revision.inputs;
  const rows: [string, string][] = [
    ['Sand', formatMoney(settings.sand_price_per_ton, settings.currency)],
    [
      '13 mm stone',
      formatMoney(settings.stone_price_per_ton, settings.currency),
    ],
    ['Cement', formatMoney(settings.cement_price_per_ton, settings.currency)],
    [
      'Sand weight',
      `${settings.sand_kg_per_wheelbarrow ?? '—'} kg / wheelbarrow`,
    ],
    [
      'Stone weight',
      `${settings.stone_kg_per_wheelbarrow ?? '—'} kg / wheelbarrow`,
    ],
    [
      'Yields',
      `${mix.full_yield ?? '—'} full / ${mix.half_yield ?? '—'} half per batch`,
    ],
  ];
  return (
    <div className="grid gap-2 text-sm">
      <p className="text-muted-foreground">
        Saved {formatDateTime(revision.created_at)} with {mix.name} and these
        inputs (prices per ton):
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
