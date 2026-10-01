import { PerpsError } from '@lifi/perps-sdk'
import type { OhlcvInterval } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'

/**
 * Map our `OhlcvInterval` literal to Lighter's `resolution` enum.
 *
 * The keys are exactly the `resolution` enum of Lighter's `GET /api/v1/candles`.
 * Lighter has no weekly candle (its API answers `1w` with code 20001,
 * `invalid param`), so `1w` stays out. SDK intervals without a direct match
 * (3m, 2h, 8h, 3d, 1w, 1M) raise a validation error rather than silently
 * rounding — the caller picks a supported timeframe.
 */
const LIGHTER_SUPPORTED_INTERVALS: Partial<Record<OhlcvInterval, string>> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '12h': '12h',
  '1d': '1d',
}

/**
 * Validate and map an SDK OHLCV interval to Lighter's resolution string.
 * Unsupported intervals raise a validation error instead of being rounded.
 *
 * @public
 */
export const mapInterval = (interval: OhlcvInterval): string => {
  const resolution = LIGHTER_SUPPORTED_INTERVALS[interval]
  if (!resolution) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Lighter does not support OHLCV interval '${interval}'. ` +
        `Supported: ${Object.keys(LIGHTER_SUPPORTED_INTERVALS).join(', ')}.`
    )
  }
  return resolution
}
