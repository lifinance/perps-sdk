import { PerpsError } from '@lifi/perps-sdk'
import type { OhlcvInterval } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'

/**
 * Map our `OhlcvInterval` literal to Ondo's kline `resolution` enum.
 *
 * Ondo exposes only the timeframes listed below. SDK intervals without a
 * direct match (3m, 30m, 2h, 8h, 12h, 3d, 1M) raise a validation error
 * rather than silently rounding — the caller picks a supported timeframe.
 */
const ONDO_SUPPORTED_INTERVALS: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
  '1w': '1W',
}

const INTERVAL_SECONDS: Record<string, OhlcvInterval> = {
  60: '1m',
  300: '5m',
  900: '15m',
  3600: '1h',
  14400: '4h',
  86400: '1d',
  604800: '1w',
}

/** @public */
export const mapInterval = (interval: string): string => {
  const resolution = ONDO_SUPPORTED_INTERVALS[interval]
  if (!resolution) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Ondo does not support OHLCV interval '${interval}'. ` +
        `Supported: ${Object.keys(ONDO_SUPPORTED_INTERVALS).join(', ')}.`
    )
  }
  return resolution
}

/**
 * Recover the SDK interval from a kline frame's bar span in seconds. Ondo's
 * kline updates carry no resolution field — only the interval start/end —
 * so the span is the only way to route a frame to its subscription.
 * @public
 */
export const intervalFromBarSpan = (
  spanSecs: number
): OhlcvInterval | undefined => INTERVAL_SECONDS[spanSecs]
