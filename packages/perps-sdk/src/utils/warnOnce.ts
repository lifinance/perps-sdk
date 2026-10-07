/**
 * The number of keys one warner remembers. Venue wire data supplies the keys,
 * so the memory must not grow for as long as the process runs.
 */
const KEY_MEMORY_LIMIT = 256

/**
 * Build a warner that writes each distinct key once. The warner forgets the
 * oldest key when its memory is full, so a key it saw long ago can warn a
 * second time.
 *
 * @internal
 */
export const createWarnOnce = (): ((key: string, message: string) => void) => {
  const seen = new Set<string>()
  return (key, message) => {
    if (seen.has(key)) {
      return
    }
    if (seen.size >= KEY_MEMORY_LIMIT) {
      const oldest = seen.values().next().value
      if (oldest !== undefined) {
        seen.delete(oldest)
      }
    }
    seen.add(key)
    console.warn(message)
  }
}

const MAX_VALUE_CHARS = 64

/**
 * Describe a skipped venue row. The venue value is cut to a fixed length, so
 * a warner key built from the text stays small.
 *
 * @internal
 */
export const skippedRowMessage = (
  source: string,
  row: string,
  field: string,
  value: unknown,
  expected: string
): string => {
  const text = String(value)
  const shown =
    text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text
  return `[${source}] skipping ${row} row: \`${field}\` is not a valid ${expected}: '${shown}'`
}

const warnSkippedRowOnce = createWarnOnce()

/**
 * Warn once that a provider mapper skipped a venue row because a required
 * field is not valid.
 *
 * @param expected - What the field must be. Defaults to `'decimal'`.
 * @internal
 */
export const warnSkippedVenueRow = (
  provider: string,
  row: string,
  field: string,
  value: unknown,
  expected = 'decimal'
): void => {
  const message = skippedRowMessage(provider, row, field, value, expected)
  warnSkippedRowOnce(message, message)
}
