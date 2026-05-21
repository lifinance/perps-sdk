import type { Subscription } from '@lifi/perps-types'
import type { PerpsSDKClient } from '../client/createPerpsClient.js'
import { getProviders } from '../services/getProviders.js'
import { HyperliquidWsProvider } from './hyperliquid/HyperliquidWsProvider.js'
import {
  type LighterAuthProvider,
  LighterWsProvider,
} from './lighter/LighterWsProvider.js'
import type {
  EventForSubscription,
  SubscriptionListener,
  WsProvider,
} from './types.js'

export interface PerpsWsClientOptions {
  /**
   * Async function that mints a Lighter auth token for an L1 address. When
   * provided, authenticated Lighter channels (orderUpdates, positions) will
   * use the returned token. The provider is invoked on each subscribe send,
   * including reconnects, so callers can transparently rotate tokens.
   */
  lighterAuthProvider?: LighterAuthProvider
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
    if (provider === 'lighter') {
      return new LighterWsProvider(wsUrl, provider, {
        authProvider: this.options.lighterAuthProvider,
      })
    }
    return new HyperliquidWsProvider(wsUrl, provider, subProviders)
  }
}
