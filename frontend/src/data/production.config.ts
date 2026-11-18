/** §2.2 and §8.4: one mold makes one block in a 48-hour cycle. */
export const CYCLE_HOURS = 48;
export const MS_PER_HOUR = 3_600_000;
/** §8.1: cement is measured in 50 kg bags. */
export const CEMENT_BAG_KG = 50;
/** §8.1: one metric ton is 1000 kg. */
export const KG_PER_TON = 1000;
/** Kilograms → tons is a shift of three decimal places. */
export const KG_TO_TON_DECIMALS = 3;
/** §8.3: only the final cost is rounded, to two decimal places. */
export const COST_DECIMALS = 2;
/** §8.2: a project name has 1 to 100 characters. */
export const PROJECT_NAME_MAX_LENGTH = 100;
/** §2.2: the default currency label. Changing it never converts prices. */
export const DEFAULT_CURRENCY = 'RUB';
