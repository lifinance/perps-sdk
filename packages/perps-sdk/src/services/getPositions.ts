import type { PositionsResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { requireProvider } from '../utils/requireProvider.js'

/**
 * Parameters for {@link getPositions}.
 *
 * @public
 */
export interface GetPositionsParams {
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
 * Get open positions for an account. Delegates to the registered venue plugin
 * (direct-to-venue); requires the provider plugin to be registered on the
 * client.
 *
 * @throws {PerpsError} When the provider plugin is not registered, or on
 *   backend / network / parsing errors.
 * @example
 * ```ts
 * const { positions } = await getPositions(client, {
 *   provider: 'hyperliquid',
 *   address: '0x1234...',
 * })
 * ```
 * @public
 */
export async function getPositions(
  client: PerpsSDKClient,
  params: GetPositionsParams,
  options?: SDKRequestOptions
): Promise<PositionsResponse> {
  return requireProvider(client, params.provider).getPositions(
    {
      address: params.address,
      marketId: params.marketId,
      limit: params.limit,
      cursor: params.cursor,
    },
    options
  )
}
