import type { OhlcvInterval, OhlcvResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetOhlcvParams {
  /** Provider to get OHLCV from (e.g., 'hyperliquid') */
  provider: string
  /** Canonical wire-level `Asset.assetId` (not `displaySymbol`). */
  assetId: string
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
 * @example
 * ```ts
 * const { candles } = await getOhlcv(client, {
 *   provider: 'hyperliquid',
 *   assetId: 'BTC',
 *   interval: '1h',
 *   limit: 100,
 * })
 * ```
 */
export async function getOhlcv(
  client: PerpsSDKClient,
  params: GetOhlcvParams,
  options?: SDKRequestOptions
): Promise<OhlcvResponse> {
  const url = buildUrl(
    `${client.config.apiUrl}/ohlcv/${encodeURIComponent(params.assetId)}`,
    {
      provider: params.provider,
      interval: params.interval,
      startTime: params.startTime,
      endTime: params.endTime,
      limit: params.limit,
    }
  )
  return request<OhlcvResponse>(client.config, url, {}, options)
}
