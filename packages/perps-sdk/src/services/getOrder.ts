import type { Order } from '@lifi/perps-types'
import type { Address } from 'viem'
import { requireProvider } from '../client/requireProvider.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link getOrder}.
 *
 * @public
 */
export interface GetOrderParams {
  /** Provider to get order from (e.g., 'hyperliquid') */
  provider: string
  /** Wallet address */
  address: Address
  /** Order ID */
  id: string
}

/**
 * Get a specific order by ID. Delegates to the registered venue plugin
 * (direct-to-venue); requires the provider plugin to be registered on the
 * client.
 *
 * @throws {PerpsError} When the provider plugin is not registered, or on
 *   backend / network / parsing errors.
 * @example
 * ```ts
 * const order = await getOrder(client, {
 *   provider: 'hyperliquid',
 *   address: '0x1234...',
 *   id: '123456',
 * })
 * ```
 * @public
 */
export async function getOrder(
  client: PerpsSDKClient,
  params: GetOrderParams,
  options?: SDKRequestOptions
): Promise<Order> {
  return requireProvider(client, params.provider).getOrder(
    { address: params.address, id: params.id },
    options
  )
}
