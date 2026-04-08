import type { PricesResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetPricesParams {
  /** Provider to get prices from (e.g., 'hyperliquid') */
  provider: string
  /** Optional list of symbols to filter (e.g., ['BTC', 'ETH']) */
  symbols?: string[]
}

/**
 * Get current prices for markets.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Map of symbol to price
 * @throws {PerpsError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { prices } = await getPrices(client, { provider: 'hyperliquid' })
 * console.log(prices) // { BTC: '95000.00', ETH: '3400.00', ... }
 *
 * // Filter by symbols
 * const { prices } = await getPrices(client, {
 *   provider: 'hyperliquid',
 *   symbols: ['BTC', 'ETH']
 * })
 * ```
 */
export async function getPrices(
  client: PerpsSDKClient,
  params: GetPricesParams,
  options?: SDKRequestOptions
): Promise<PricesResponse> {
  const url = buildUrl(`${client.config.apiUrl}/prices`, {
    provider: params.provider,
    symbols: params.symbols?.join(','),
  })
  return request<PricesResponse>(client.config, url, {}, options)
}
