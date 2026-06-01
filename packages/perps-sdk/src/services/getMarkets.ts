import type { MarketsResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetMarketsParams {
  /** Provider to get markets from (e.g., 'hyperliquid') */
  provider: string
  /** Optional filter — opaque `Market.id`s (not display symbols). */
  marketIds?: string[]
}

/**
 * Get all available markets for a provider. Thin pass-through to the LI.FI
 * backend's Valkey-cached `/perps/markets` route — the canonical source of
 * public market data for widget consumers.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { markets } = await getMarkets(client, { provider: 'hyperliquid' })
 * ```
 */
export async function getMarkets(
  client: PerpsSDKClient,
  params: GetMarketsParams,
  options?: SDKRequestOptions
): Promise<MarketsResponse> {
  const url = buildUrl(`${client.config.apiUrl}/markets`, {
    provider: params.provider,
    marketIds: params.marketIds?.join(','),
  })
  return request<MarketsResponse>(client.config, url, {}, options)
}
