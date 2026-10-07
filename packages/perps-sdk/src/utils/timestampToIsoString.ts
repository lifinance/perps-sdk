import { PerpsErrorCode } from '@lifi/perps-types'
import { PerpsError } from '../errors/PerpsError.js'
import { createSafeFunction } from './createSafeFunction.js'

/**
 * Read a venue time (epoch milliseconds or a date string) as an ISO-8601
 * string.
 *
 * @throws {PerpsError} `ValidationError` when `Date` cannot read `value`.
 * @public
 */
export function timestampToIsoString(value: string | number): string {
  const time = value === '' ? Number.NaN : new Date(value).getTime()
  if (Number.isNaN(time)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `'${String(value)}' is not a valid timestamp.`
    )
  }
  return new Date(time).toISOString()
}

/**
 * {@link timestampToIsoString}, or `undefined` with a warning when it throws.
 *
 * @public
 */
export const safeTimestampToIsoString = createSafeFunction(
  'timestampToIsoString',
  timestampToIsoString
)
