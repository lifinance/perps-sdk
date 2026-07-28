import type { PositionsResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import { requireProvider } from '../client/requireProvider.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link getPositions}.
 *
 * @public
 */
export interface GetPositionsParams {
  provider: string
  address: Address
  /** Optional opaque `Market.id` filter, not a display symbol. */
  marketId?: string
  /** Maximum items returned; provider defaults and caps apply. */
  limit?: number
  /** Opaque pagination cursor from the previous response. */
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
