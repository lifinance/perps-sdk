import type { OrdersResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import { requireProvider } from '../client/requireProvider.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link getOrders}.
 *
 * @public
 */
export interface GetOrdersParams {
  /** Provider key whose account orders are read. */
  provider: string
  /** User account address to query. */
  address: Address
  /** Optional opaque `Market.id` filter, not a display symbol. */
  marketId?: string
  /** Maximum orders to return, when supported by the venue. */
  limit?: number
  /** Opaque pagination cursor from the previous response. */
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
