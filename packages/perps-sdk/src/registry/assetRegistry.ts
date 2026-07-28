import type { Asset, AssetsResponse } from '@lifi/perps-types'
import { buildUrl, request } from '../transport/request.js'
import type { PerpsSDKClient } from '../types/provider.js'
import { ReferenceDataRegistry } from './referenceDataRegistry.js'

/**
 * Per-provider index over the backend's `/assets` token registry, keyed by
 * `Asset.id` — the provider-native asset id (Lighter: the stringified
 * `asset_id`, Hyperliquid spot: the venue token index). Obtain via
 * {@link getAssetRegistry}.
 *
 * @public
 */
export class AssetRegistry extends ReferenceDataRegistry<Asset> {
  constructor(client: PerpsSDKClient, provider: string) {
    super(client, provider, 'asset')
  }

  /**
   * The most recently synced asset list. Empty before the first {@link sync}.
   *
   * @public
   */
  get assets(): readonly Asset[] {
    return this.items
  }

  protected fetchItems(): Promise<Asset[]> {
    const url = buildUrl(`${this.client.config.apiUrl}/assets`, {
      provider: this.provider,
    })
    return request<AssetsResponse>(this.client.config, url).then(
      (response) => response.assets
    )
  }

  protected keyOf(asset: Asset): string {
    return asset.id
  }
}

const registries = new WeakMap<PerpsSDKClient, Map<string, AssetRegistry>>()

/**
 * The stable {@link AssetRegistry} for `(client, provider)`.
 *
 * @public
 */
export function getAssetRegistry(
  client: PerpsSDKClient,
  provider: string
): AssetRegistry {
  let byProvider = registries.get(client)
  if (byProvider === undefined) {
    byProvider = new Map()
    registries.set(client, byProvider)
  }
  let registry = byProvider.get(provider)
  if (registry === undefined) {
    registry = new AssetRegistry(client, provider)
    byProvider.set(provider, registry)
  }
  return registry
}
