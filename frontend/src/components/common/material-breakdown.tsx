import type { Material, MaterialCalculation } from '@/api';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { formatCount, formatMoney, formatTons } from '@/lib';

const MATERIAL_ROWS: { key: Material; label: string }[] = [
  { key: 'sand', label: 'Sand' },
  { key: 'stone', label: '13 mm stone' },
  { key: 'cement', label: 'Cement' },
];

interface MaterialBreakdownProps {
  calculation: MaterialCalculation;
  caption: string;
}

/** FR13: each material's quantity and cost, the total and the mixing surplus. */
export function MaterialBreakdown({
  calculation,
  caption,
}: MaterialBreakdownProps) {
  const { currency } = calculation;
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-md bg-muted p-3">
          <dt className="text-xs text-muted-foreground">Full batches</dt>
          <dd className="text-xl font-semibold">
            {formatCount(calculation.full_batches)}
          </dd>
        </div>
        <div className="rounded-md bg-muted p-3">
          <dt className="text-xs text-muted-foreground">Half batches</dt>
          <dd className="text-xl font-semibold">
            {formatCount(calculation.half_batches)}
          </dd>
        </div>
        <div className="rounded-md bg-muted p-3">
          <dt className="text-xs text-muted-foreground">Total batches</dt>
          <dd className="text-xl font-semibold">
            {formatCount(calculation.total_batches)}
          </dd>
        </div>
      </dl>
      <Table>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Material</TableHead>
            <TableHead scope="col" className="text-right">
              Quantity
            </TableHead>
            <TableHead scope="col" className="hidden text-right sm:table-cell">
              Price / ton
            </TableHead>
            <TableHead scope="col" className="text-right">
              Cost
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MATERIAL_ROWS.map(({ key, label }) => {
            const item = calculation[key];
            return (
              <TableRow key={key}>
                <TableHead scope="row" className="text-foreground">
                  {label}
                </TableHead>
                <TableCell className="text-right tabular-nums">
                  {formatTons(item.tons)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatMoney(item.price_per_ton, currency)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(item.cost, currency)}
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="font-semibold">
            <TableHead scope="row" colSpan={2} className="text-foreground">
              Total material cost
            </TableHead>
            <TableCell aria-hidden="true" className="hidden sm:table-cell" />
            <TableCell className="text-right text-base tabular-nums">
              {formatMoney(calculation.total_cost, currency)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p className="text-sm text-muted-foreground">
        Mixing surplus from whole batches:{' '}
        {formatCount(calculation.full_surplus)} full and{' '}
        {formatCount(calculation.half_surplus)} half blocks. Surplus is not
        added to the order.
      </p>
    </div>
  );
}
