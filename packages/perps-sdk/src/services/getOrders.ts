import type { OrdersResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { requireProvider } from '../utils/requireProvider.js'

export interface GetOrdersParams {
  /** Provider (e.g., 'hyperliquid') */
  provider: string
  /** Wallet address */
  address: Address
  /** Optional filter — canonical `Asset.assetId` (not `displaySymbol`) */
  assetId?: string
  /** Maximum number of results */
  limit?: number
  /** Pagination cursor */
  cursor?: string
}

/**
 * Get open orders and trigger orders for an account. Delegates to the
 * registered venue plugin (direct-to-venue); requires the provider plugin to be
 * registered on the client.
 *
 * @example
 * ```ts
 * const { openOrders, triggerOrders } = await getOrders(client, {
 *   provider: 'hyperliquid',
 *   address: '0x1234...',
 * })
 * ```
 */
export async function getOrders(
  client: PerpsSDKClient,
  params: GetOrdersParams,
  options?: SDKRequestOptions
): Promise<OrdersResponse> {
  return requireProvider(client, params.provider).getOrders(
    client,
    {
      address: params.address,
      assetId: params.assetId,
      limit: params.limit,
      cursor: params.cursor,
    },
    options
  )
}
