import type { Address, OrdersResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetOrdersParams {
  /** Provider (e.g., 'hyperliquid') */
  provider: string
  /** Wallet address */
  address: Address
  /** Optional symbol to filter orders by market */
  symbol?: string
  /** Maximum number of results */
  limit?: number
  /** Pagination cursor */
  cursor?: string
}

/**
 * Get open orders and trigger orders for an account.
 *
 * @example
 * ```ts
 * const { openOrders, triggerOrders } = await getOrders(client, {
 *   provider: 'hyperliquid',
 *   address: '0x1234...',
 * })
 * ```
 *
 * @deprecated Will move to the provider package
 * `@lifi/perps-sdk-provider-<key>`. Migrate to
 * `client.getProvider(provider)?.getOrders(client, { address, ... })`.
 */
export async function getOrders(
  client: PerpsSDKClient,
  params: GetOrdersParams,
  options?: SDKRequestOptions
): Promise<OrdersResponse> {
  const url = buildUrl(`${client.config.apiUrl}/orders`, {
    provider: params.provider,
    address: params.address,
    ...(params.symbol ? { symbol: params.symbol } : {}),
    ...(params.limit ? { limit: String(params.limit) } : {}),
    ...(params.cursor ? { cursor: params.cursor } : {}),
  })
  return request<OrdersResponse>(client.config, url, {}, options)
}
