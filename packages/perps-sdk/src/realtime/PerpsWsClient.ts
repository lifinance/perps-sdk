import type { Subscription } from '@lifi/perps-types'
import type { PerpsSDKClient } from '../client/createPerpsClient.js'
import { getProviders } from '../services/getProviders.js'
import { HyperliquidWsProvider } from './hyperliquid/HyperliquidWsProvider.js'
import type {
  EventForSubscription,
  SubscriptionListener,
  WsProvider,
} from './types.js'

/**
 * Factory for a per-provider WS plugin. Invoked once per provider key the
 * first time `subscribe(...)` is called against it.
 */
export type WsProviderFactory = (params: {
  /** Provider key (e.g. `'lighter'`, `'hyperliquid'`). */
  provider: string
  /** WS URL discovered from `/providers`. */
  wsUrl: string
  /** Sub-provider keys (Hyperliquid sub-dexes). */
  subProviders: string[]
}) => WsProvider

export interface PerpsWsClientOptions {
  /**
   * Per-provider WS factory overrides. Map a provider key (e.g.
   * `'lighter'`) to a factory that returns a `WsProvider`. Without an
   * entry the SDK falls back to its bundled `HyperliquidWsProvider` for
   * any non-`'hyperliquid'` provider — pass an explicit factory for
   * Lighter / future providers via this map.
   */
  wsProviders?: Record<string, WsProviderFactory>
}

export class PerpsWsClient {
  private readonly client: PerpsSDKClient
  private readonly options: PerpsWsClientOptions
  private providers = new Map<string, WsProvider>()
  private initPromises = new Map<string, Promise<WsProvider>>()

  constructor(client: PerpsSDKClient, options: PerpsWsClientOptions = {}) {
    this.client = client
    this.options = options
  }

  async subscribe<S extends Subscription>(
    sub: S,
    listener: (event: EventForSubscription<S>) => void
  ): Promise<() => void> {
    const providerKey = sub.dex
    const provider = await this.getOrCreateProvider(providerKey)
    return provider.subscribe(sub, listener as SubscriptionListener)
  }

  close() {
    for (const p of this.providers.values()) {
      p.close()
    }
    this.providers.clear()
    this.initPromises.clear()
  }

  private async getOrCreateProvider(provider: string): Promise<WsProvider> {
    const existing = this.providers.get(provider)
    if (existing) {
      return existing
    }

    let initPromise = this.initPromises.get(provider)
    if (!initPromise) {
      initPromise = this.initProvider(provider)
      this.initPromises.set(provider, initPromise)
    }
    return initPromise
  }

  private async initProvider(provider: string): Promise<WsProvider> {
    const { providers } = await getProviders(this.client)

    const providerInfo = providers.find((d) => d.key === provider)
    if (!providerInfo?.wsUrl) {
      throw new Error(`No WebSocket URL found for provider: ${provider}`)
    }

    const allMarkets = (providerInfo.markets ?? []) as Array<{
      id: string
    }>
    const providerConfig = this.client.config.providers?.[provider]
    const configuredMarkets = providerConfig?.markets
    const filteredMarkets = configuredMarkets
      ? allMarkets.filter((m) => configuredMarkets.includes(m.id))
      : allMarkets
    const subProviders = filteredMarkets
      .map((m) => m.id)
      .filter((id) => id !== provider && id !== 'spot')

    const wsProvider = this.createWsProvider(
      provider,
      providerInfo.wsUrl,
      subProviders
    )
    this.providers.set(provider, wsProvider)
    return wsProvider
  }

  private createWsProvider(
    provider: string,
    wsUrl: string,
    subProviders: string[]
  ): WsProvider {
    const factory = this.options.wsProviders?.[provider]
    if (factory !== undefined) {
      return factory({ provider, wsUrl, subProviders })
    }
    return new HyperliquidWsProvider(wsUrl, provider, subProviders)
  }
}
