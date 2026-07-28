import type { ActivitiesResponse, ActivityType } from '@lifi/perps-types'
import type { Address } from 'viem'
import { requireProvider } from '../client/requireProvider.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link getActivity}.
 *
 * @public
 */
export interface GetActivityParams {
  provider: string
  address: Address
  limit?: number
  /** Opaque pagination cursor from the previous response. */
  cursor?: string
  /** Include activity at or after this Unix timestamp in milliseconds. */
  startTime?: number
  /** Include activity at or before this Unix timestamp in milliseconds. */
  endTime?: number
  type?: ActivityType[]
}

/**
 * Get account activity (deposits, withdrawals, liquidations, funding payments).
 * Delegates to the registered venue plugin (direct-to-venue); requires the
 * provider plugin to be registered on the client.
 *
 * @throws {PerpsError} When the provider plugin is not registered, or on
 *   backend / network / parsing errors.
 * @example
 * ```ts
 * const { items, pagination } = await getActivity(client, {
 *   provider: 'hyperliquid',
 *   address: '0x1234...',
 *   limit: 50,
 * })
 * ```
 * @public
 */
export async function getActivity(
  client: PerpsSDKClient,
  params: GetActivityParams,
  options?: SDKRequestOptions
): Promise<ActivitiesResponse> {
  return requireProvider(client, params.provider).getActivity(
    {
      address: params.address,
      limit: params.limit,
      cursor: params.cursor,
      startTime: params.startTime,
      endTime: params.endTime,
      type: params.type,
    },
    options
  )
}
