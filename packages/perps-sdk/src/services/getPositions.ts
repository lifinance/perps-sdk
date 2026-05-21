import type { Address, PositionsResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetPositionsParams {
  /** Provider (e.g., 'hyperliquid') */
  provider: string
  /** Wallet address */
  address: Address
  /** Optional symbol to filter to a single position */
  symbol?: string
  /** Maximum number of results */
  limit?: number
  /** Pagination cursor */
  cursor?: string
}

/**
 * Get open positions for an account.
 *
 * @example
 * ```ts
 * const { positions } = await getPositions(client, {
 *   provider: 'hyperliquid',
 *   address: '0x1234...',
 * })
 * ```
 *
 * @deprecated Will move to the provider package
 * `@lifi/perps-sdk-provider-<key>`. Migrate to
 * `client.getProvider(provider)?.getPositions(client, { address, ... })`.
 */
export async function getPositions(
  client: PerpsSDKClient,
  params: GetPositionsParams,
  options?: SDKRequestOptions
): Promise<PositionsResponse> {
  const url = buildUrl(`${client.config.apiUrl}/positions`, {
    provider: params.provider,
    address: params.address,
    ...(params.symbol ? { symbol: params.symbol } : {}),
    ...(params.limit ? { limit: String(params.limit) } : {}),
    ...(params.cursor ? { cursor: params.cursor } : {}),
  })
  return request<PositionsResponse>(client.config, url, {}, options)
}
