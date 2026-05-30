import type { Asset, AssetsResponse } from '@lifi/perps-types'
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
 * Get a specific asset by its canonical assetId. Filters the provider's
 * `/perps/assets` collection to the single requested id; the backend
 * responds 404 (thrown as a {@link PerpsError}) when nothing matches.
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
  const url = buildUrl(`${client.config.apiUrl}/assets`, {
    provider: params.provider,
    assetIds: params.assetId,
  })
  const { assets } = await request<AssetsResponse>(
    client.config,
    url,
    {},
    options
  )
  return assets[0]
}
