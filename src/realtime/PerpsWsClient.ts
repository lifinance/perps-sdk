import type { Subscription } from '@lifi/perps-types'
import type { PerpsSDKClient } from '../client/createPerpsClient.js'
import { getProviders } from '../services/getProviders.js'
import { HyperliquidWsProvider } from './hyperliquid/HyperliquidWsProvider.js'
import type {
  EventForSubscription,
  SubscriptionListener,
  WsProvider,
} from './types.js'

export class PerpsWsClient {
  private readonly client: PerpsSDKClient
  private providers = new Map<string, WsProvider>()
  private initPromises = new Map<string, Promise<WsProvider>>()

  constructor(client: PerpsSDKClient) {
    this.client = client
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
    // Currently only Hyperliquid has a WS implementation.
    // Future providers can be added here with their own WsProvider classes.
    return new HyperliquidWsProvider(wsUrl, provider, subProviders)
  }
}
