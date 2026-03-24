import type { MarketsResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetMarketsParams {
  /** Provider to get markets from (e.g., 'hyperliquid') */
  provider: string
}

/**
 * Get all available markets for a DEX.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns List of available markets
 * @throws {PerpsError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { markets } = await getMarkets(client, { provider: 'hyperliquid' })
 * console.log(markets) // [{ symbol: 'BTC', name: 'Bitcoin', ... }]
 * ```
 */
export async function getMarkets(
  client: PerpsSDKClient,
  params: GetMarketsParams,
  options?: SDKRequestOptions
): Promise<MarketsResponse> {
  const url = buildUrl(`${client.config.apiUrl}/markets`, {
    provider: params.provider,
  })
  return request<MarketsResponse>(client.config, url, {}, options)
}
