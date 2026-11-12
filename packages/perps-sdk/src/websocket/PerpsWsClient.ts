import {
  PerpsErrorCode,
  type ProvidersResponse,
  type Subscription,
} from '@lifi/perps-types'
import { PerpsError } from '../errors/PerpsError.js'
import { getProviders } from '../services/getProviders.js'
import type { GetQuoteParams } from '../services/getQuote.js'
import type { PerpsSDKClient, QuoteListener } from '../types/provider.js'
import { cachePromise } from './cachePromise.js'
import type {
  EventForSubscription,
  SubscriptionErrorListener,
  SubscriptionListener,
  WsConnectionStatus,
  WsProvider,
  WsStatusListener,
} from './types.js'
import { wsLog } from './wsLog.js'

interface StatusObserver {
  attach(provider: WsProvider): void
  release(): void
}

/**
 * Call parameters of a {@link WsProviderFactory}.
 *
 * @public
 */
export interface WsProviderFactoryParams {
  provider: string
  /** WS URL discovered from `/providers`. */
  wsUrl: string
  /**
   * The SDK client. WS providers use it to call core services (e.g.
   * `getAssets` to source the wire-id ↔ display-symbol map) without
   * duplicating backend orchestration in the WS layer.
   */
  client: PerpsSDKClient
}

/**
 * Factory for a per-provider WS plugin. Invoked once per provider key the
 * first time `subscribe(...)` is called against it.
 *
 * @public
 */
export interface WsProviderFactory {
  (params: WsProviderFactoryParams): WsProvider
  /** `true` when the venue socket serves the `candle` channel. */
  readonly streamsCandles: boolean
  /** `true` when the venue socket serves the `availableToTrade` channel. */
  readonly streamsAvailableToTrade: boolean
}

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
 * WebSocket client: lazily instantiates a per-provider {@link WsProvider} on
 * first subscription and fans subscriptions out to it.
 *
 * @public
 */
export class PerpsWsClient {
  private readonly client: PerpsSDKClient
  private readonly options: PerpsWsClientOptions
  private providers = new Map<string, WsProvider>()
  private initPromises = new Map<string, Promise<WsProvider>>()
  private readonly statusObservers = new Map<string, Set<StatusObserver>>()
  private discovery: Promise<ProvidersResponse> | undefined
  private closed = false

  constructor(client: PerpsSDKClient, options: PerpsWsClientOptions = {}) {
    this.client = client
    this.options = options
  }

  /**
   * Whether `provider`'s socket serves the `candle` channel, as reported by
   * its registered factory. Returns `false` when no factory is registered.
   * Synchronous: it reads the factory without instantiating the provider and
   * makes no network call, so a caller can branch before the first subscribe.
   *
   * @public
   */
  streamsCandles(provider: string): boolean {
    return this.options.wsProviders?.[provider]?.streamsCandles ?? false
  }

  /**
   * Whether `provider`'s socket serves the `availableToTrade` channel, as
   * reported by its registered factory. Returns `false` when no factory is
   * registered. Synchronous, with the same contract as {@link streamsCandles}.
   *
   * @public
   */
  streamsAvailableToTrade(provider: string): boolean {
    return (
      this.options.wsProviders?.[provider]?.streamsAvailableToTrade ?? false
    )
  }

  /**
   * Observe one provider's transport without creating it or requesting data.
   * Reports the current status synchronously, or `null` before provider creation.
   * Release is idempotent. Client close silently releases observers and rejects new registrations.
   */
  subscribeStatus(
    provider: string,
    listener: (status: WsConnectionStatus | null) => void
  ): () => void {
    this.assertOpen()
    const observers =
      this.statusObservers.get(provider) ?? new Set<StatusObserver>()
    this.statusObservers.set(provider, observers)
    let released = false
    let releaseProvider: (() => void) | undefined
    const notify = (status: WsConnectionStatus | null) => {
      if (released || this.closed) {
        return
      }
      try {
        listener(status)
      } catch (error) {
        wsLog.listenerFailure(provider, 'status', error)
      }
    }
    const observer: StatusObserver = {
      attach: (transport) => {
        if (released || this.closed) {
          return
        }
        let release: () => void
        try {
          release = transport.subscribeStatus(notify)
        } catch (error) {
          wsLog.statusObserverFailure(provider, error)
          return
        }
        if (released || this.closed) {
          release()
        } else {
          releaseProvider = release
        }
      },
      release: () => {
        if (released) {
          return
        }
        released = true
        releaseProvider?.()
        observers.delete(observer)
        if (observers.size === 0) {
          this.statusObservers.delete(provider)
        }
      },
    }
    observers.add(observer)
    const transport = this.providers.get(provider)
    if (transport) {
      observer.attach(transport)
    } else {
      notify(null)
    }
    return observer.release
  }

  /**
   * Subscribe to a WebSocket channel and resolve to an unsubscribe after local registration.
   * Initial failures reject the promise. Later failures invoke `onError`.
   * Registration and socket status do not confirm account authorization.
   *
   * @throws {PerpsError} When no WS provider factory is registered for the
   *   subscription's `dex`.
   * @public
   */
  async subscribe<S extends Subscription>(
    sub: S,
    listener: (event: EventForSubscription<S>) => void,
    onStatus?: WsStatusListener,
    onError?: SubscriptionErrorListener
  ): Promise<() => void> {
    const providerKey = sub.dex
    const provider = await this.getOrCreateProvider(providerKey)
    provider.reconnect()
    return provider.subscribe(
      sub,
      listener as SubscriptionListener,
      onStatus,
      onError
    )
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
    for (const observers of this.statusObservers.values()) {
      for (const observer of observers) {
        observer.release()
      }
    }
    this.statusObservers.clear()
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

    const { providers } = await this.discoverProviders()
    this.assertOpen()

    const providerInfo = providers.find((d) => d.key === provider)
    if (!providerInfo?.wsUrl) {
      throw new Error(`No WebSocket URL found for provider: ${provider}`)
    }

    const wsProvider = factory({
      provider,
      wsUrl: providerInfo.wsUrl,
      client: this.client,
    })
    this.providers.set(provider, wsProvider)
    for (const observer of [...(this.statusObservers.get(provider) ?? [])]) {
      observer.attach(wsProvider)
    }
    this.assertOpen()
    return wsProvider
  }

  /**
   * Shares one in-flight `/providers` request between concurrent venue
   * inits. The slot clears on settlement, so a later init fetches fresh
   * metadata and a rejection is never cached.
   */
  private discoverProviders(): Promise<ProvidersResponse> {
    if (this.discovery) {
      return this.discovery
    }
    const discovery = getProviders(this.client).finally(() => {
      if (this.discovery === discovery) {
        this.discovery = undefined
      }
    })
    this.discovery = discovery
    return discovery
  }
}
