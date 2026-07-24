import type { MarketsResponse } from '@lifi/perps-types'
import { isActiveMarket } from '../registry/marketRegistry.js'
import { buildUrl, request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link getMarkets}.
 *
 * @public
 */
export interface GetMarketsParams {
  provider: string
  /** Optional filter — opaque `Market.id`s (not display symbols). */
  marketIds?: string[]
}

/**
 * Get active markets for a provider. Delisted entries remain available to
 * internal registries for historical mapping, but are excluded from this
 * public market-selection surface.
 *
 * Thin pass-through to the LI.FI backend's Valkey-cached `/perps/markets`
 * route — the canonical source of public market data for widget consumers.
 *
 * @throws {PerpsError} On backend, network, or parsing errors.
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { markets } = await getMarkets(client, { provider: 'hyperliquid' })
 * ```
 * @public
 */
export async function getMarkets(
  client: PerpsSDKClient,
  params: GetMarketsParams,
  options?: SDKRequestOptions
): Promise<MarketsResponse> {
  const url = buildUrl(`${client.config.apiUrl}/markets`, {
    provider: params.provider,
    marketIds: params.marketIds?.join(','),
  })
  const response = await request<MarketsResponse>(
    client.config,
    url,
    {},
    options
  )
  return { markets: response.markets.filter(isActiveMarket) }
}
