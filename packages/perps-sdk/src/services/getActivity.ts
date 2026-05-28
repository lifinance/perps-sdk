import type { ActivitiesResponse, ActivityType } from '@lifi/perps-types'
import type { Address } from 'viem'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { requireProvider } from '../utils/requireProvider.js'

export interface GetActivityParams {
  /** Provider to get activity from (e.g., 'hyperliquid') */
  provider: string
  /** Wallet address */
  address: Address
  /** Maximum number of items to return */
  limit?: number
  /** Cursor for pagination */
  cursor?: string
  /** Filter: activity after this timestamp (ms) */
  startTime?: number
  /** Filter: activity before this timestamp (ms) */
  endTime?: number
  /** Filter by activity type(s) */
  type?: ActivityType[]
}

/**
 * Get account activity (deposits, withdrawals, liquidations, funding payments).
 * Delegates to the registered venue plugin (direct-to-venue); requires the
 * provider plugin to be registered on the client.
 *
 * @example
 * ```ts
 * const { items, pagination } = await getActivity(client, {
 *   provider: 'hyperliquid',
 *   address: '0x1234...',
 *   limit: 50,
 * })
 * ```
 */
export async function getActivity(
  client: PerpsSDKClient,
  params: GetActivityParams,
  options?: SDKRequestOptions
): Promise<ActivitiesResponse> {
  return requireProvider(client, params.provider).getActivity(
    client,
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
