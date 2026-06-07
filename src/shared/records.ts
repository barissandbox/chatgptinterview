/** Coerces unknown values into safe record objects for defensive parsing. */
export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
