import type { AssetsResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetAssetsParams {
  /** Provider to get assets from (e.g., 'hyperliquid') */
  provider: string
}

/**
 * Get all available assets for a DEX, grouped by providerMarketId.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { assets } = await getAssets(client, { provider: 'hyperliquid' })
 * console.log(assets) // { hyperliquid: [...], xyz: [...], spot: [...] }
 * ```
 */
export async function getAssets(
  client: PerpsSDKClient,
  params: GetAssetsParams,
  options?: SDKRequestOptions
): Promise<AssetsResponse> {
  const url = buildUrl(`${client.config.apiUrl}/assets`, {
    provider: params.provider,
  })
  return request<AssetsResponse>(client.config, url, {}, options)
}
