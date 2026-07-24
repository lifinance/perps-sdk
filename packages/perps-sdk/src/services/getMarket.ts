import type { Market, MarketsResponse } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import { PerpsError } from '../errors/PerpsError.js'
import { isActiveMarket } from '../registry/marketRegistry.js'
import { buildUrl, request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link getMarket}.
 *
 * @public
 */
export interface GetMarketParams {
  provider: string
  /**
   * Opaque provider `Market.id` (e.g. `"BTC"`, `"xyz:PURR"`, `"@142"` on
   * Hyperliquid; `"0"`, `"1"` on Lighter). Pass a `displaySymbol` here and
   * lookups will 404 for providers where the two diverge.
   */
  marketId: string
}

/**
 * Get a specific active market by its opaque marketId. Requests the single
 * market from the backend `/markets` route (filtered by `marketIds`) and
 * returns the first active match; throws a `MarketNotFound` {@link PerpsError}
 * when the backend responds 404, returns an empty list, or returns a
 * delisted market, matching
 * `MarketRegistry.require`'s miss behaviour.
 *
 * @throws {PerpsError} On backend (e.g. 404 or empty match), network, or parsing errors.
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
  const market = markets[0]
  if (market === undefined || !isActiveMarket(market)) {
    const error = new PerpsError(
      PerpsErrorCode.MarketNotFound,
      `No ${params.provider} market found for marketId '${params.marketId}'`
    )
    error.tool = params.provider
    throw error
  }
  return market
}
