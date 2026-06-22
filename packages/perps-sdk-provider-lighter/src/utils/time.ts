/** Convert seconds since unix epoch to ISO-8601. */
export const toIsoFromSeconds = (seconds: number): string =>
  new Date(seconds * 1000).toISOString()

/** Convert milliseconds since unix epoch to ISO-8601. */
export const toIsoFromMs = (ms: number): string => new Date(ms).toISOString()
