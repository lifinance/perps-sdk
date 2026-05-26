import type { Order } from '@lifi/perps-types'
import type { Address } from 'viem'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetOrderParams {
  /** Provider to get order from (e.g., 'hyperliquid') */
  provider: string
  /** Wallet address */
  address: Address
  /** Order ID */
  id: string
}

/**
 * Get a specific order by ID.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Order details
 * @throws {PerpsError} On API error responses (e.g., 404 if order not found)
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const order = await getOrder(client, {
 *   provider: 'hyperliquid',
 *   address: '0x1234...',
 *   id: '123456'
 * })
 * console.log(order) // { orderId: '123456', status: 'FILLED', ... }
 * ```
 *
 * @deprecated Will move to the provider package
 * `@lifi/perps-sdk-provider-<key>`. Migrate to
 * `client.getProvider(provider)?.getOrder(client, { address, id })`.
 */
export async function getOrder(
  client: PerpsSDKClient,
  params: GetOrderParams,
  options?: SDKRequestOptions
): Promise<Order> {
  const url = buildUrl(
    `${client.config.apiUrl}/order/${encodeURIComponent(params.id)}`,
    {
      provider: params.provider,
      address: params.address,
    }
  )
  return request<Order>(client.config, url, {}, options)
}
