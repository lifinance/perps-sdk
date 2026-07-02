import { PerpsErrorCode, type Subscription } from '@lifi/perps-types'
import { PerpsError } from '../errors/PerpsError.js'
import { getProviders } from '../services/getProviders.js'
import type { GetQuoteParams } from '../services/getQuote.js'
import type { PerpsSDKClient, QuoteListener } from '../types/provider.js'
import { cachePromise } from './cachePromise.js'
import type {
  EventForSubscription,
  SubscriptionListener,
  WsProvider,
  WsStatusListener,
} from './types.js'

/**
 * Factory for a per-provider WS plugin. Invoked once per provider key the
 * first time `subscribe(...)` is called against it.
 *
 * @public
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
  /**
   * The SDK client. WS providers use it to call core services (e.g.
   * `getAssets` to source the wire-id ↔ display-symbol map) without
   * duplicating backend orchestration in the WS layer.
   */
  client: PerpsSDKClient
}) => WsProvider

/**
 * Options for {@link PerpsWsClient}.
 *
 * @public
 */
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

/**
 * Realtime client: lazily instantiates a per-provider {@link WsProvider} on
 * first subscription and fans subscriptions out to it.
 *
 * @public
 */
export class PerpsWsClient {
  private readonly client: PerpsSDKClient
  private readonly options: PerpsWsClientOptions
  private providers = new Map<string, WsProvider>()
  private initPromises = new Map<string, Promise<WsProvider>>()
  private closed = false

  constructor(client: PerpsSDKClient, options: PerpsWsClientOptions = {}) {
    this.client = client
    this.options = options
  }

  /**
   * Subscribe to a realtime channel, lazily creating the provider's WS
   * connection. Returns an unsubscribe function.
   *
   * @param onStatus - Optional listener for the underlying connection's
   *   health. Fires `reconnecting` on a transient drop and the terminal
   *   `disconnected` once auto-reconnect is abandoned, so consumers can
   *   surface a reconnecting/disconnected state instead of silently showing
   *   stale data.
   * @throws {PerpsError} When no WS provider factory is registered for the
   *   subscription's `dex`.
   * @public
   */
  async subscribe<S extends Subscription>(
    sub: S,
    listener: (event: EventForSubscription<S>) => void,
    onStatus?: WsStatusListener
  ): Promise<() => void> {
    const providerKey = sub.dex
    const provider = await this.getOrCreateProvider(providerKey)
    provider.reconnect()
    return provider.subscribe(sub, listener as SubscriptionListener, onStatus)
  }

  /**
   * Stream live fill quotes for `params.symbol` on `params.provider`, lazily
   * creating the provider's WS connection. The provider's WS plugin layers the
   * quote on its orderbook channel, so a concurrent orderbook subscription on
   * the same market shares one wire subscription. Returns an unsubscribe
   * function.
   *
   * @throws {PerpsError} When no WS provider factory is registered for
   *   `params.provider`, or no market matches the symbol+type.
   * @public
   */
  async subscribeQuote(
    params: GetQuoteParams,
    onQuote: QuoteListener
  ): Promise<() => void> {
    const provider = await this.getOrCreateProvider(params.provider)
    return provider.subscribeQuote(
      {
        symbol: params.symbol,
        side: params.side,
        size: params.size,
        type: params.type,
      },
      onQuote
    )
  }

  /**
   * Close every open provider WS connection and drop all cached providers.
   * Terminal: after `close()` the client is dead — `subscribe` and
   * `subscribeQuote` reject, and any provider init still suspended mid-flight
   * aborts without opening a socket. Create a new instance to subscribe again.
   *
   * @public
   */
  close() {
    this.closed = true
    for (const p of this.providers.values()) {
      p.close()
    }
    this.providers.clear()
    this.initPromises.clear()
  }

  /**
   * Reconnect an already-created provider when its socket reached terminal
   * `disconnected`. Safe no-op when the provider is unknown or not terminal.
   *
   * @public
   */
  reconnect(provider: string): void {
    this.providers.get(provider)?.reconnect()
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'PerpsWsClient is closed. Create a new instance to subscribe again.'
      )
    }
  }

  private async getOrCreateProvider(provider: string): Promise<WsProvider> {
    this.assertOpen()

    const existing = this.providers.get(provider)
    if (existing) {
      return existing
    }

    return cachePromise(
      () => this.initPromises.get(provider),
      (p) => {
        if (p) {
          this.initPromises.set(provider, p)
        } else {
          this.initPromises.delete(provider)
        }
      },
      () => this.initProvider(provider)
    )
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
    this.assertOpen()

    const providerInfo = providers.find((d) => d.key === provider)
    if (!providerInfo?.wsUrl) {
      throw new Error(`No WebSocket URL found for provider: ${provider}`)
    }

    const allMarkets = (providerInfo.categories ?? []) as Array<{
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
      client: this.client,
    })
    this.providers.set(provider, wsProvider)
    return wsProvider
  }
}
