import { PerpsErrorCode, type Subscription } from '@lifi/perps-types'
import type { PerpsSDKClient } from '../client/createPerpsClient.js'
import { PerpsError } from '../errors/PerpsError.js'
import { getProviders } from '../services/getProviders.js'
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
  /**
   * Markets visible to this provider via `/providers`, optionally filtered
   * by the consumer's `createPerpsClient({ providers: { [key]: { markets } } })`
   * config. Each provider interprets these its own way — Hyperliquid uses
   * them to decide which sub-DEXes to subscribe to; Lighter ignores them.
   */
  markets: string[]
}) => WsProvider

export interface PerpsWsClientOptions {
  /**
   * Per-provider WS factory map. Each key (e.g. `'hyperliquid'`,
   * `'lighter'`) maps to a factory that returns a `WsProvider`. Concrete
   * implementations ship with the provider packages — e.g.
   * `@lifi/perps-sdk-provider-hyperliquid` exports `HyperliquidWsProvider`,
   * `@lifi/perps-sdk-provider-lighter` exports `LighterWsProvider`.
   * Subscribing to a provider key without a registered factory throws.
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
    const factory = this.options.wsProviders?.[provider]
    if (factory === undefined) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `No WS provider factory registered for '${provider}'. Pass one via ` +
          'new PerpsWsClient(client, { wsProviders: { [key]: factory } }).'
      )
    }

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
    const markets = (
      configuredMarkets
        ? allMarkets.filter((m) => configuredMarkets.includes(m.id))
        : allMarkets
    ).map((m) => m.id)

    const wsProvider = factory({
      provider,
      wsUrl: providerInfo.wsUrl,
      markets,
    })
    this.providers.set(provider, wsProvider)
    return wsProvider
  }
}
