import type { BlockSize, SizeBalance } from '@/api';

/** FR25: what can still be collected for one size. */
export function collectable(balance: SizeBalance) {
  return Math.max(0, balance.ready - balance.collected);
}

/** Client check before sending; the API enforces the same rule. */
export function collectionErrors(
  amounts: Record<BlockSize, string>,
  balance: Record<BlockSize, SizeBalance>,
): Partial<Record<BlockSize, string>> {
  const errors: Partial<Record<BlockSize, string>> = {};
  for (const size of ['full', 'half'] as const) {
    const raw = amounts[size].trim();
    const available = collectable(balance[size]);
    if (!/^\d+$/.test(raw)) errors[size] = 'Enter a whole number of 0 or more';
    else if (Number(raw) > available) {
      errors[size] =
        `Only ${available} ready ${size} blocks are left to collect`;
    }
  }
  if (
    !errors.full &&
    !errors.half &&
    Number(amounts.full) + Number(amounts.half) === 0
  ) {
    errors.full = 'Collect at least one block';
  }
  return errors;
}
