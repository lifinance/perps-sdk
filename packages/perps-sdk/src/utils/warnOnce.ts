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
 * Cut venue text to a fixed length, so a warner key or message built from it
 * stays small.
 *
 * @internal
 */
export const cutVenueText = (value: unknown): string => {
  const text = String(value)
  return text.length > MAX_VALUE_CHARS
    ? `${text.slice(0, MAX_VALUE_CHARS)}…`
    : text
}

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
  expected: string,
  marketId?: string
): string => {
  const market = marketId === undefined ? '' : ` on market '${marketId}'`
  return `[${source}] skipping ${row} row${market}: \`${field}\` is not a valid ${expected}: '${cutVenueText(value)}'`
}

const warnSkippedRowOnce = createWarnOnce()

/**
 * Warn once for each provider, row, field, expected kind and market that a
 * provider mapper skipped a venue row because a required field is not valid.
 * The key holds no venue value, so a second bad value for the same field on
 * the same market stays silent.
 *
 * @param options.expected - What the field must be. Defaults to `'decimal'`.
 * @internal
 */
export const warnSkippedVenueRow = (
  provider: string,
  row: string,
  field: string,
  value: unknown,
  {
    marketId,
    expected = 'decimal',
  }: { marketId?: string; expected?: string } = {}
): void => {
  warnSkippedRowOnce(
    `${provider}|${row}|${field}|${expected}|${marketId ?? ''}`,
    skippedRowMessage(provider, row, field, value, expected, marketId)
  )
}
