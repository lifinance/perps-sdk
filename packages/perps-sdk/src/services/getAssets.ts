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
 * Get all available assets for a provider. Thin pass-through to the LI.FI
 * backend's Valkey-cached `/perps/assets` route — the canonical source of
 * public market data for widget consumers.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { assets } = await getAssets(client, { provider: 'hyperliquid' })
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
