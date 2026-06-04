import type { OhlcvInterval, OhlcvResponse } from '@lifi/perps-types'
import { buildUrl, request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link getOhlcv}.
 *
 * @public
 */
export interface GetOhlcvParams {
  /** Provider to get OHLCV from (e.g., 'hyperliquid') */
  provider: string
  /** Opaque provider `Market.id` (not `displaySymbol`). */
  marketId: string
  /** Candle interval */
  interval: OhlcvInterval
  /** Start time (Unix timestamp in milliseconds) */
  startTime?: number
  /** End time (Unix timestamp in milliseconds) */
  endTime?: number
  /** Maximum number of candles to return */
  limit?: number
}

/**
 * Get OHLCV (candlestick) data for a market.
 *
 * @throws {PerpsError} When the provider plugin is not registered, or on
 *   backend / network / parsing errors.
 * @example
 * ```ts
 * const { candles } = await getOhlcv(client, {
 *   provider: 'hyperliquid',
 *   marketId: 'BTC',
 *   interval: '1h',
 *   limit: 100,
 * })
 * ```
 * @public
 */
export async function getOhlcv(
  client: PerpsSDKClient,
  params: GetOhlcvParams,
  options?: SDKRequestOptions
): Promise<OhlcvResponse> {
  const url = buildUrl(`${client.config.apiUrl}/ohlcv`, {
    provider: params.provider,
    marketId: params.marketId,
    interval: params.interval,
    startTime: params.startTime,
    endTime: params.endTime,
    limit: params.limit,
  })
  return request<OhlcvResponse>(client.config, url, {}, options)
}
