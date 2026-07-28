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
  provider: string
  /** Opaque provider `Market.id`, not a display symbol. */
  marketId: string
  interval: OhlcvInterval
  /** Unix timestamp in milliseconds for the start bound. */
  startTime?: number
  /** Unix timestamp in milliseconds for the end bound. */
  endTime?: number
  limit?: number
}

/**
 * Get OHLCV (candlestick) data for a market.
 *
 * @throws {PerpsError} On backend, network, or parsing errors.
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
