import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import type { OhlcvInterval, OhlcvResponse } from '../types/perps.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetOhlcvParams {
  /** DEX to get OHLCV from (e.g., 'hyperliquid') */
  dex: string
  /** Market symbol (e.g., 'BTC') */
  symbol: string
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
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns OHLCV candle data
 * @throws {HTTPError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { candles } = await getOhlcv(client, {
 *   dex: 'hyperliquid',
 *   symbol: 'BTC',
 *   interval: '1h',
 *   limit: 100
 * })
 * console.log(candles) // [{ t: 1704067200000, o: '94000', h: '95000', ... }]
 * ```
 */
export async function getOhlcv(
  client: PerpsSDKClient,
  params: GetOhlcvParams,
  options?: SDKRequestOptions
): Promise<OhlcvResponse> {
  const url = buildUrl(`${client.config.apiUrl}/ohlcv/${params.symbol}`, {
    dex: params.dex,
    interval: params.interval,
    startTime: params.startTime,
    endTime: params.endTime,
    limit: params.limit,
  })
  return request<OhlcvResponse>(client.config, url, {}, options)
}
