import { Link } from '@tanstack/react-router';

import type { MaterialCalculation } from '@/api';
import { FormAlert, MaterialBreakdown } from '@/components/common';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { SETTINGS_FIELD_LABELS } from '@/features/projects/data/settings-field-labels.config';
import { missingFields } from '@/features/projects/utils/project-form';
import { getErrorMessage } from '@/lib';

interface CalculationPanelProps {
  calculation: MaterialCalculation | undefined;
  error: unknown;
  isCalculating: boolean;
  onCalculate: () => void;
}

/** UC04 with SC01 and SC02: the estimate, or exactly why there is none. */
export function CalculationPanel({
  calculation,
  error,
  isCalculating,
  onCalculate,
}: CalculationPanelProps) {
  const missing = missingFields(error).filter((field) => field !== 'mix_id');
  return (
    <Card aria-live="polite">
      <CardHeader>
        <CardTitle>Material estimate</CardTitle>
        <CardDescription>
          Uses the current Settings. Saving the project saves this estimate with
          its prices.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {calculation ? (
          <MaterialBreakdown
            calculation={calculation}
            caption="Calculated material estimate"
          />
        ) : null}
        {missing.length > 0 ? (
          <FormAlert
            tone="warning"
            title="No cost yet: some settings are missing"
          >
            <ul className="list-disc pl-5">
              {missing.map((field) => (
                <li key={field}>{SETTINGS_FIELD_LABELS[field] ?? field}</li>
              ))}
            </ul>
            <Link
              to="/settings"
              className="mt-2 inline-block font-medium text-primary underline"
            >
              Complete Settings
            </Link>
          </FormAlert>
        ) : error ? (
          <FormAlert tone="error" title="The cost was not calculated">
            {getErrorMessage(error, 'Try again.')}
          </FormAlert>
        ) : null}
        {!calculation ? (
          <Button
            type="button"
            variant="secondary"
            onClick={onCalculate}
            disabled={isCalculating}
          >
            {isCalculating ? 'Calculating…' : 'Calculate cost'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
