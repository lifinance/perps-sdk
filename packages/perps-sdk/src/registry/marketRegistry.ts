import type { Market, MarketDisplay, MarketsResponse } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import { PerpsError } from '../errors/PerpsError.js'
import { buildUrl, request } from '../transport/request.js'
import type { PerpsSDKClient } from '../types/provider.js'
import { ReferenceDataRegistry } from './referenceDataRegistry.js'

/**
 * Per-provider index over the backend's enriched `/markets` list, keyed by
 * `Market.id` — the venue wire key (Hyperliquid: the coin string, Lighter:
 * the stringified `market_index`). Obtain via {@link getMarketRegistry};
 * shared by the provider packages' REST services and WS providers.
 *
 * @public
 */
export class MarketRegistry extends ReferenceDataRegistry<Market> {
  constructor(client: PerpsSDKClient, provider: string) {
    super(client, provider, 'market')
  }

  /** The most recently synced market list. Empty before the first {@link sync}. */
  get markets(): readonly Market[] {
    return this.items
  }

  /**
   * Lookup by `Market.id`, throwing when the backend list does not know the
   * id. The list is the source of truth for every tradable market, so an id
   * the venue references but the backend does not know is a hard error —
   * never a silent fallback to an unenriched stand-in.
   *
   * @throws {PerpsError} `MarketNotFound`.
   */
  require(marketId: string): Market {
    const market = this.get(marketId)
    if (market === undefined) {
      const error = new PerpsError(
        PerpsErrorCode.MarketNotFound,
        `No ${this.provider} market found for marketId '${marketId}'`
      )
      error.tool = this.provider
      throw error
    }
    return market
  }

  protected fetchItems(): Promise<Market[]> {
    const url = buildUrl(`${this.client.config.apiUrl}/markets`, {
      provider: this.provider,
    })
    return request<MarketsResponse>(this.client.config, url).then(
      (response) => response.markets
    )
  }

  protected keyOf(market: Market): string {
    return market.id
  }
}

const registries = new WeakMap<PerpsSDKClient, Map<string, MarketRegistry>>()

/**
 * The stable {@link MarketRegistry} for `(client, provider)`.
 *
 * @public
 */
export function getMarketRegistry(
  client: PerpsSDKClient,
  provider: string
): MarketRegistry {
  let byProvider = registries.get(client)
  if (byProvider === undefined) {
    byProvider = new Map()
    registries.set(client, byProvider)
  }
  let registry = byProvider.get(provider)
  if (registry === undefined) {
    registry = new MarketRegistry(client, provider)
    byProvider.set(provider, registry)
  }
  return registry
}

/**
 * Project a {@link Market} to the {@link MarketDisplay} identity embedded on
 * mapped positions/orders/fills, preserving the backend's `baseAsset` and
 * `quoteAsset` verbatim (logos, display names).
 *
 * @public
 */
export const toMarketDisplay = (market: Market): MarketDisplay => ({
  providerId: market.providerId,
  id: market.id,
  categoryId: market.categoryId,
  baseAsset: market.baseAsset,
  quoteAsset: market.quoteAsset,
})
