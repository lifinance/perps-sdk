import type { FillsResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { requireProvider } from '../utils/requireProvider.js'

/**
 * Parameters for {@link getFills}.
 *
 * @public
 */
export interface GetFillsParams {
  /** Provider to get fills from (e.g., 'hyperliquid') */
  provider: string
  /** Wallet address */
  address: Address
  /** Maximum number of items to return */
  limit?: number
  /** Cursor for pagination */
  cursor?: string
  /** Filter: fills after this timestamp (ms) */
  startTime?: number
  /** Filter: fills before this timestamp (ms) */
  endTime?: number
}

/**
 * Get order fills for an account. Delegates to the registered venue plugin
 * (direct-to-venue); requires the provider plugin to be registered on the
 * client.
 *
 * @throws {PerpsError} When the provider plugin is not registered, or on
 *   backend / network / parsing errors.
 * @example
 * ```ts
 * const { items, pagination } = await getFills(client, {
 *   provider: 'hyperliquid',
 *   address: '0x1234...',
 *   limit: 50,
 * })
 * ```
 * @public
 */
export async function getFills(
  client: PerpsSDKClient,
  params: GetFillsParams,
  options?: SDKRequestOptions
): Promise<FillsResponse> {
  return requireProvider(client, params.provider).getFills(
    client,
    {
      address: params.address,
      limit: params.limit,
      cursor: params.cursor,
      startTime: params.startTime,
      endTime: params.endTime,
    },
    options
  )
}
