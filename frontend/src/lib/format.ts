/**
 * Display formatting for API values. Decimals arrive as strings and are
 * formatted without float rounding surprises for the sizes this app uses.
 */

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const MONEY_DECIMALS = 2;
const TON_DECIMALS = 3;

export function formatMoney(value: string | null, currency: string) {
  if (value === null) return '—';
  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: MONEY_DECIMALS,
    maximumFractionDigits: MONEY_DECIMALS,
  })} ${currency}`;
}

export function formatTons(value: string) {
  return `${Number(value).toLocaleString(undefined, {
    maximumFractionDigits: TON_DECIMALS,
  })} t`;
}

export function formatCount(value: number) {
  return value.toLocaleString();
}

export function formatDateTime(value: string | null) {
  if (value === null) return '—';
  return dateTimeFormat.format(new Date(value));
}

export function formatHours(hours: number) {
  const days = hours / 24;
  return Number.isInteger(days) ? `${hours} h (${days} days)` : `${hours} h`;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** ISO timestamp → the `YYYY-MM-DDTHH:mm` a datetime-local input shows. */
export function toDateTimeInput(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * A datetime-local value → ISO timestamp with the browser's offset, so the
 * saved time keeps its timezone (§8.4). Empty or invalid input gives ''.
 */
export function fromDateTimeInput(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  return `${value}:00${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}
