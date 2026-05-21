import type { Asset } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetAssetParams {
  /** Provider to get asset from (e.g., 'hyperliquid') */
  provider: string
  /** Asset symbol (e.g., 'BTC') */
  symbol: string
}

/**
 * Get a specific asset by symbol.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const asset = await getAsset(client, { provider: 'hyperliquid', symbol: 'BTC' })
 * console.log(asset) // { symbol: 'BTC', markPrice: '95000.00', ... }
 * ```
 *
 * @deprecated Will move to the provider package
 * `@lifi/perps-sdk-provider-<key>`. Migrate to
 * `client.getProvider(provider)?.getAsset(client, { symbol })`.
 */
export async function getAsset(
  client: PerpsSDKClient,
  params: GetAssetParams,
  options?: SDKRequestOptions
): Promise<Asset> {
  const url = buildUrl(
    `${client.config.apiUrl}/assets/${encodeURIComponent(params.symbol)}`,
    {
      provider: params.provider,
    }
  )
  return request<Asset>(client.config, url, {}, options)
}
