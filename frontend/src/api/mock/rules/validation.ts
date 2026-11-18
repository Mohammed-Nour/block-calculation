import type { ValidationIssue } from '@/api/errors';
import type {
  CollectionInput,
  Material,
  ProjectInput,
  SettingsUpdate,
  SizeBalance,
  BlockSize,
  Settings,
} from '@/api/types';
import { PROJECT_NAME_MAX_LENGTH } from '@/data';

/** §8.2 validation, matching the backend's 422 `detail[]` entries. */

const DECIMAL = /^[0-9]+(?:\.[0-9]+)?$/;
const CURRENCY = /^[A-Za-z]{3}$/;
const MATERIALS: Material[] = ['sand', 'stone', 'cement'];

const issue = (
  loc: (string | number)[],
  msg: string,
  type = 'value_error',
) => ({
  loc: ['body', ...loc],
  msg,
  type,
});

const isCount = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

function checkDecimal(
  issues: ValidationIssue[],
  field: string,
  value: string | null,
  positive: boolean,
) {
  if (value === null) return;
  if (!DECIMAL.test(value)) {
    issues.push(issue([field], 'Enter a number such as 10.50'));
  } else if (positive && Number(value) === 0) {
    issues.push(issue([field], 'Enter a value greater than 0'));
  }
}

export function validateSettings(
  update: SettingsUpdate,
  current: Settings,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!CURRENCY.test(update.currency.trim())) {
    issues.push(issue(['currency'], 'Enter a three-letter currency code'));
  }
  for (const material of MATERIALS) {
    checkDecimal(
      issues,
      `${material}_price_per_ton`,
      update[`${material}_price_per_ton`],
      false,
    );
  }
  checkDecimal(
    issues,
    'sand_kg_per_wheelbarrow',
    update.sand_kg_per_wheelbarrow,
    true,
  );
  checkDecimal(
    issues,
    'stone_kg_per_wheelbarrow',
    update.stone_kg_per_wheelbarrow,
    true,
  );
  for (const field of ['full_molds', 'half_molds'] as const) {
    if (!isCount(update[field])) {
      issues.push(issue([field], 'Enter a whole number of 0 or more'));
    }
  }
  const ids = new Set(update.mix_yields.map((mix) => mix.id));
  if (update.mix_yields.length !== 4 || ids.size !== 4) {
    issues.push(
      issue(
        ['mix_yields'],
        'Include one yield entry for each of Mix 1 through Mix 4',
      ),
    );
  }
  update.mix_yields.forEach((mix, index) => {
    for (const field of ['full_yield', 'half_yield'] as const) {
      const value = mix[field];
      if (value !== null && !(isCount(value) && value > 0)) {
        issues.push(
          issue(
            ['mix_yields', index, field],
            'Enter a whole number greater than 0',
          ),
        );
      }
    }
  });
  for (const material of MATERIALS) {
    const field = `${material}_price_per_ton` as const;
    const value = update[field];
    if (
      value !== null &&
      DECIMAL.test(value) &&
      Number(value) === 0 &&
      // Like the backend: only a *new* zero needs confirming.
      !(current[field] !== null && Number(current[field]) === 0) &&
      !update.confirmed_zero_prices.includes(material)
    ) {
      issues.push(
        issue(
          [field],
          'Confirm the zero price before saving',
          'value_error.zero_price_confirmation',
        ),
      );
    }
  }
  return issues;
}

export function validateProject(input: ProjectInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const name = input.name.trim();
  if (name.length < 1 || name.length > PROJECT_NAME_MAX_LENGTH) {
    issues.push(
      issue(
        ['name'],
        `Enter a name of 1 to ${PROJECT_NAME_MAX_LENGTH} characters`,
      ),
    );
  }
  if (Number.isNaN(Date.parse(input.requested_start_at))) {
    issues.push(issue(['requested_start_at'], 'Enter a start date and time'));
  }
  for (const field of ['full_quantity', 'half_quantity'] as const) {
    if (!isCount(input[field])) {
      issues.push(issue([field], 'Enter a whole number of 0 or more'));
    }
  }
  if (
    isCount(input.full_quantity) &&
    isCount(input.half_quantity) &&
    input.full_quantity + input.half_quantity === 0
  ) {
    issues.push(
      issue(['full_quantity'], 'Order at least one full or half block'),
    );
  }
  if (input.mix_id !== null && ![1, 2, 3, 4].includes(input.mix_id)) {
    issues.push(issue(['mix_id'], 'Choose Mix 1, 2, 3 or 4'));
  }
  return issues;
}

/** FR25 and AT09: collect only within the ready, uncollected balance. */
export function validateCollection(
  input: CollectionInput,
  balance: Record<BlockSize, SizeBalance>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const amounts: [BlockSize, number][] = [
    ['full', input.full_quantity],
    ['half', input.half_quantity],
  ];
  for (const [size, amount] of amounts) {
    const field = `${size}_quantity`;
    const available = balance[size].ready - balance[size].collected;
    if (!isCount(amount)) {
      issues.push(issue([field], 'Enter a whole number of 0 or more'));
    } else if (amount > available) {
      issues.push(
        issue(
          [field],
          `Only ${available} ready ${size} blocks are left to collect`,
        ),
      );
    }
  }
  if (input.full_quantity + input.half_quantity === 0) {
    issues.push(issue(['full_quantity'], 'Collect at least one block'));
  }
  if (Number.isNaN(Date.parse(input.collected_at))) {
    issues.push(issue(['collected_at'], 'Enter the collection time'));
  }
  return issues;
}
