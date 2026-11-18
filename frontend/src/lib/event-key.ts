/** A unique key per user action, so a repeated submit counts once (FR31). */
export function newEventKey() {
  return crypto.randomUUID();
}
