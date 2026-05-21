import type { Address, FillsResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetFillsParams {
  /** Provider to get fills from (e.g., 'hyperliquid') */
  provider: string
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
 * Get order fills for an account.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Order fills with pagination
 * @throws {PerpsError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { items, pagination } = await getFills(client, {
 *   provider: 'hyperliquid',
 *   address: '0x1234...',
 *   limit: 50
 * })
 *
 * console.log(items) // [{ id: '123', symbol: 'BTC', status: 'FILLED', ... }]
 *
 * // Fetch next page
 * if (pagination.hasMore) {
 *   const nextPage = await getFills(client, {
 *     provider: 'hyperliquid',
 *     address: '0x1234...',
 *     cursor: pagination.cursor
 *   })
 * }
 * ```
 *
 * @deprecated Will move to the provider package
 * `@lifi/perps-sdk-provider-<key>`. Migrate to
 * `client.getProvider(provider)?.getFills(client, { address, ... })`.
 */
export async function getFills(
  client: PerpsSDKClient,
  params: GetFillsParams,
  options?: SDKRequestOptions
): Promise<FillsResponse> {
  const url = buildUrl(`${client.config.apiUrl}/fills`, {
    provider: params.provider,
    address: params.address,
    limit: params.limit,
    cursor: params.cursor,
    startTime: params.startTime,
    endTime: params.endTime,
  })
  return request<FillsResponse>(client.config, url, {}, options)
}
