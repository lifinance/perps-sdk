import type { Asset, AssetsResponse } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import { PerpsError } from '../errors/PerpsError.js'
import { buildUrl, request } from '../transport/request.js'
import type { PerpsSDKClient } from '../types/provider.js'
import { ReferenceDataRegistry } from './referenceDataRegistry.js'

const addressKey = (address: string): string =>
  /^0x[0-9a-f]{40}$/i.test(address) ? address.toLowerCase() : address

/** Provider `/assets` index by native `id`, optional wire identity, and L1 address. @public */
export class AssetRegistry extends ReferenceDataRegistry<Asset> {
  constructor(client: PerpsSDKClient, provider: string) {
    super(client, provider, 'asset', {
      wireId: (asset) => asset.wireId,
      l1Address: (asset) =>
        asset.l1Address === undefined ? undefined : addressKey(asset.l1Address),
    })
  }

  /** Lookup by provider identity; hexadecimal L1 addresses are case-insensitive. */
  override get(
    id: string,
    key: 'id' | 'wireId' | 'l1Address' = 'id'
  ): Asset | undefined {
    return key === 'id'
      ? super.get(id)
      : this.getByIndex(key === 'l1Address' ? addressKey(id) : id, key)
  }

  /** Resolve registry membership or report a stale or mis-keyed asset registry. */
  require(id: string, key: 'id' | 'wireId' | 'l1Address' = 'id'): Asset {
    const asset = this.get(id, key)
    if (asset === undefined) {
      const error = new PerpsError(
        PerpsErrorCode.ValidationError,
        `[${this.provider}] stale or mis-keyed asset registry: unknown ${key} '${id}'`
      )
      error.tool = this.provider
      throw error
    }
    return asset
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
