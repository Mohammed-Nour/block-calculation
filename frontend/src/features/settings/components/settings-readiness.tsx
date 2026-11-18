import type { Settings } from '@/api';
import { FormAlert } from '@/components/common';
import { missingForCosting } from '@/features/settings/utils/settings-form';

/** Tells the User what is still needed before estimates can be calculated. */
export function SettingsReadiness({ settings }: { settings: Settings }) {
  const missing = missingForCosting(settings);
  if (missing.length === 0) {
    return (
      <FormAlert tone="success" title="Settings are complete">
        Estimates and completion forecasts can be calculated.
      </FormAlert>
    );
  }
  return (
    <FormAlert tone="warning" title="Still needed before costing">
      <ul className="list-disc pl-5">
        {missing.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </FormAlert>
  );
}
