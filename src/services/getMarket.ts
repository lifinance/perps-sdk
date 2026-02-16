import type { Market } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetMarketParams {
  /** DEX to get market from (e.g., 'hyperliquid') */
  dex: string
  /** Market symbol (e.g., 'BTC') */
  symbol: string
}

/**
 * Get a specific market by symbol.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Market details
 * @throws {HTTPError} On API error responses (e.g., 404 if market not found)
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const market = await getMarket(client, { dex: 'hyperliquid', symbol: 'BTC' })
 * console.log(market) // { symbol: 'BTC', markPrice: '95000.00', ... }
 * ```
 */
export async function getMarket(
  client: PerpsSDKClient,
  params: GetMarketParams,
  options?: SDKRequestOptions
): Promise<Market> {
  const url = buildUrl(`${client.config.apiUrl}/markets/${params.symbol}`, {
    dex: params.dex,
  })
  return request<Market>(client.config, url, {}, options)
}
