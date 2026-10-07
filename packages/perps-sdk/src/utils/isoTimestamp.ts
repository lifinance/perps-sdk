/**
 * Read a venue time (epoch milliseconds or a date string) as an ISO-8601
 * string.
 *
 * @returns `undefined` for a value `Date` cannot read. Never throws.
 * @internal
 */
export const asIsoTimestamp = (
  value: string | number | null | undefined
): string | undefined => {
  if (value == null || value === '') {
    return undefined
  }
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? undefined : new Date(time).toISOString()
}
