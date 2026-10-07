import { timestampToIsoString } from '@lifi/perps-sdk'

/**
 * Convert seconds since unix epoch to ISO-8601.
 *
 * @throws {PerpsError} `ValidationError` when `seconds` is not a valid time.
 */
export const toIsoFromSeconds = (seconds: number): string =>
  timestampToIsoString(seconds * 1000)

/**
 * Convert milliseconds since unix epoch to ISO-8601.
 *
 * @throws {PerpsError} `ValidationError` when `ms` is not a valid time.
 */
export const toIsoFromMs = (ms: number): string => timestampToIsoString(ms)
