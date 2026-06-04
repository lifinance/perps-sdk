import type { Market, MarketsResponse } from '@lifi/perps-types'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'
import { buildUrl, request } from '../utils/request.js'

/**
 * Parameters for {@link getMarket}.
 *
 * @public
 */
export interface GetMarketParams {
  /** Provider to get market from (e.g., 'hyperliquid') */
  provider: string
  /**
   * Opaque provider `Market.id` (e.g. `"BTC"`, `"xyz:PURR"`, `"@142"` on
   * Hyperliquid; `"0"`, `"1"` on Lighter). Pass a `displaySymbol` here and
   * lookups will 404 for providers where the two diverge.
   */
  marketId: string
}

/**
 * Get a specific market by its opaque marketId. Filters the provider's
 * `/perps/markets` collection to the single requested id; the backend
 * responds 404 (thrown as a {@link PerpsError}) when nothing matches.
 *
 * @throws {PerpsError} When the provider plugin is not registered, or on
 *   backend / network / parsing errors.
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const market = await getMarket(client, { provider: 'hyperliquid', marketId: 'BTC' })
 * console.log(market.baseAsset.displaySymbol)
 * ```
 * @public
 */
export async function getMarket(
  client: PerpsSDKClient,
  params: GetMarketParams,
  options?: SDKRequestOptions
): Promise<Market> {
  const url = buildUrl(`${client.config.apiUrl}/markets`, {
    provider: params.provider,
    marketIds: params.marketId,
  })
  const { markets } = await request<MarketsResponse>(
    client.config,
    url,
    {},
    options
  )
  return markets[0]
}
