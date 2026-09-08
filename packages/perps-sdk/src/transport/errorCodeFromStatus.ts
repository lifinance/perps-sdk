import { PerpsErrorCode } from '@lifi/perps-types'

/**
 * Resolve the {@link PerpsErrorCode} a non-ok HTTP response carries, for the
 * provider error boundaries.
 *
 * A 429 always resolves to `RateLimitExceeded`, and `statusCodes` cannot
 * override it. `statusCodes` adds the codes a single boundary can speak for,
 * such as Hyperliquid's agent rejection on a 403. Every other status takes
 * `fallback`, a 5xx included: the venue answered, so the outcome of the
 * request stays open.
 *
 * @public
 */
export function errorCodeFromStatus(
  status: number,
  fallback: PerpsErrorCode,
  statusCodes?: Readonly<Partial<Record<number, PerpsErrorCode>>>
): PerpsErrorCode {
  if (status === 429) {
    return PerpsErrorCode.RateLimitExceeded
  }

  return statusCodes?.[status] ?? fallback
}
