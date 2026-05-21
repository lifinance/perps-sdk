import type { OrderbookResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetOrderbookParams {
  /** Provider to get orderbook from (e.g., 'hyperliquid') */
  provider: string
  /** Market symbol (e.g., 'BTC') */
  symbol: string
  /** Number of levels to return (default varies by DEX) */
  depth?: number
}

/**
 * Get orderbook for a market.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Orderbook with bids and asks
 * @throws {PerpsError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { bids, asks } = await getOrderbook(client, {
 *   provider: 'hyperliquid',
 *   symbol: 'BTC',
 *   depth: 20
 * })
 * console.log(bids[0]) // { price: '94999.50', size: '1.5' }
 * console.log(asks[0]) // { price: '95000.50', size: '2.0' }
 * ```
 *
 * @deprecated Will move to the provider package
 * `@lifi/perps-sdk-provider-<key>`. Migrate to
 * `client.getProvider(provider)?.getOrderbook(client, { symbol, depth })`.
 */
export async function getOrderbook(
  client: PerpsSDKClient,
  params: GetOrderbookParams,
  options?: SDKRequestOptions
): Promise<OrderbookResponse> {
  const url = buildUrl(
    `${client.config.apiUrl}/orderbook/${encodeURIComponent(params.symbol)}`,
    {
      provider: params.provider,
      depth: params.depth,
    }
  )
  return request<OrderbookResponse>(client.config, url, {}, options)
}
