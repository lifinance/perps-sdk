import type { OrderbookResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetOrderbookParams {
  /** Provider to get orderbook from (e.g., 'hyperliquid') */
  provider: string
  /** Canonical wire-level `Asset.assetId` (not `displaySymbol`). */
  assetId: string
  /** Number of levels to return (default varies by DEX) */
  depth?: number
}

/**
 * Get an orderbook backfill snapshot for a market. Pair with a provider WS
 * subscription for live updates.
 */
export async function getOrderbook(
  client: PerpsSDKClient,
  params: GetOrderbookParams,
  options?: SDKRequestOptions
): Promise<OrderbookResponse> {
  const url = buildUrl(`${client.config.apiUrl}/orderbook`, {
    provider: params.provider,
    assetId: params.assetId,
    depth: params.depth,
  })
  return request<OrderbookResponse>(client.config, url, {}, options)
}
