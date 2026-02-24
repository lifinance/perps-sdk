import type { Address, HistoryResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetHistoryParams {
  /** DEX to get history from (e.g., 'hyperliquid') */
  dex: string
  /** Wallet address */
  address: Address
  /** Maximum number of items to return */
  limit?: number
  /** Cursor for pagination */
  cursor?: string
  /** Filter: orders after this timestamp (ms) */
  startTime?: number
  /** Filter: orders before this timestamp (ms) */
  endTime?: number
}

/**
 * Get order history for an account.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Order history with pagination
 * @throws {HTTPError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { items, pagination } = await getHistory(client, {
 *   dex: 'hyperliquid',
 *   address: '0x1234...',
 *   limit: 50
 * })
 *
 * console.log(items) // [{ id: '123', symbol: 'BTC', status: 'FILLED', ... }]
 *
 * // Fetch next page
 * if (pagination.hasMore) {
 *   const nextPage = await getHistory(client, {
 *     dex: 'hyperliquid',
 *     address: '0x1234...',
 *     cursor: pagination.cursor
 *   })
 * }
 * ```
 */
export async function getHistory(
  client: PerpsSDKClient,
  params: GetHistoryParams,
  options?: SDKRequestOptions
): Promise<HistoryResponse> {
  const url = buildUrl(`${client.config.apiUrl}/history`, {
    dex: params.dex,
    address: params.address,
    limit: params.limit,
    cursor: params.cursor,
    startTime: params.startTime,
    endTime: params.endTime,
  })
  return request<HistoryResponse>(client.config, url, {}, options)
}
