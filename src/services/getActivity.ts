import type {
  ActivitiesResponse,
  ActivityType,
  Address,
} from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetActivityParams {
  /** DEX to get activity from (e.g., 'hyperliquid') */
  dex: string
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
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Activity items with pagination
 * @throws {PerpsError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { items, pagination } = await getActivity(client, {
 *   dex: 'hyperliquid',
 *   address: '0x1234...',
 *   limit: 50
 * })
 *
 * // Fetch next page
 * if (pagination.hasMore) {
 *   const nextPage = await getActivity(client, {
 *     dex: 'hyperliquid',
 *     address: '0x1234...',
 *     cursor: pagination.cursor
 *   })
 * }
 * ```
 */
export async function getActivity(
  client: PerpsSDKClient,
  params: GetActivityParams,
  options?: SDKRequestOptions
): Promise<ActivitiesResponse> {
  let url = buildUrl(`${client.config.apiUrl}/activity`, {
    dex: params.dex,
    address: params.address,
    limit: params.limit,
    cursor: params.cursor,
    startTime: params.startTime,
    endTime: params.endTime,
  })
  if (params.type?.length) {
    const sep = url.includes('?') ? '&' : '?'
    url +=
      sep + params.type.map((t) => `type=${encodeURIComponent(t)}`).join('&')
  }
  return request<ActivitiesResponse>(client.config, url, {}, options)
}
