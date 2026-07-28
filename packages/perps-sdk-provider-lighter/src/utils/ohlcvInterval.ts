import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'

/**
 * Map our `OhlcvInterval` literal to Lighter's `resolution` enum.
 *
 * Lighter exposes only the timeframes listed below. SDK intervals without a
 * direct match (3m, 2h, 8h, 3d, 1M) raise a validation error rather than
 * silently rounding — the caller picks a supported timeframe.
 */
const LIGHTER_SUPPORTED_INTERVALS: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '12h': '12h',
  '1d': '1d',
  '1w': '1w',
}

/**
 * Validate and map an SDK OHLCV interval to Lighter's resolution string.
 * Unsupported intervals raise a validation error instead of being rounded.
 *
 * @public
 */
export const mapInterval = (interval: string): string => {
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
