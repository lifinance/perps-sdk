import type { OrderbookResponse } from '@lifi/perps-types'
import { buildUrl, request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link getOrderbook}.
 *
 * @public
 */
export interface GetOrderbookParams {
  provider: string
  /** Opaque provider `Market.id` (not `displaySymbol`). */
  marketId: string
  /** Number of levels to return (default varies by DEX) */
  depth?: number
}

/**
 * Get an orderbook backfill snapshot for a market. Pair with a provider WS
 * subscription for live updates.
 *
 * @throws {PerpsError} On backend error responses, network, or parsing errors.
 * @public
 */
export async function getOrderbook(
  client: PerpsSDKClient,
  params: GetOrderbookParams,
  options?: SDKRequestOptions
): Promise<OrderbookResponse> {
  const url = buildUrl(`${client.config.apiUrl}/orderbook`, {
    provider: params.provider,
    marketId: params.marketId,
    depth: params.depth,
  })
  return request<OrderbookResponse>(client.config, url, {}, options)
}
