import type { OrdersResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { requireProvider } from '../utils/requireProvider.js'

/**
 * Parameters for {@link getOrders}.
 *
 * @public
 */
export interface GetOrdersParams {
  /** Provider (e.g., 'hyperliquid') */
  provider: string
  /** Wallet address */
  address: Address
  /** Optional filter — opaque `Market.id` (not `displaySymbol`) */
  marketId?: string
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
 * @throws {PerpsError} When the provider plugin is not registered, or on
 *   backend / network / parsing errors.
 * @example
 * ```ts
 * const { openOrders, triggerOrders } = await getOrders(client, {
 *   provider: 'hyperliquid',
 *   address: '0x1234...',
 * })
 * ```
 * @public
 */
export async function getOrders(
  client: PerpsSDKClient,
  params: GetOrdersParams,
  options?: SDKRequestOptions
): Promise<OrdersResponse> {
  return requireProvider(client, params.provider).getOrders(
    {
      address: params.address,
      marketId: params.marketId,
      limit: params.limit,
      cursor: params.cursor,
    },
    options
  )
}
