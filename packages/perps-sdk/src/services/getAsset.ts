import type { Asset } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetAssetParams {
  /** Provider to get asset from (e.g., 'hyperliquid') */
  provider: string
  /**
   * Canonical wire-level Asset identifier — the value of `Asset.assetId`
   * (e.g. `"BTC"`, `"xyz:PURR"`, `"@142"` on Hyperliquid; `"0"`, `"1"` on
   * Lighter). Pass `displaySymbol` here and lookups will 404 for providers
   * where the two diverge.
   */
  assetId: string
}

/**
 * Get a specific asset by its canonical assetId.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const asset = await getAsset(client, { provider: 'hyperliquid', assetId: 'BTC' })
 * console.log(asset.displaySymbol)
 * ```
 */
export async function getAsset(
  client: PerpsSDKClient,
  params: GetAssetParams,
  options?: SDKRequestOptions
): Promise<Asset> {
  const url = buildUrl(
    `${client.config.apiUrl}/assets/${encodeURIComponent(params.assetId)}`,
    {
      provider: params.provider,
    }
  )
  return request<Asset>(client.config, url, {}, options)
}
