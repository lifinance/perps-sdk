import type { Subscription } from '@lifi/perps-types'
import type { PerpsSDKClient } from '../client/createPerpsClient.js'
import { getMarkets } from '../services/getMarkets.js'
import { getProviders } from '../services/getProviders.js'
import { HyperliquidWsProvider } from './hyperliquid/HyperliquidWsProvider.js'
import type { EventForSubscription, SubscriptionListener } from './types.js'

export class PerpsWsClient {
  private readonly client: PerpsSDKClient
  private providers = new Map<string, HyperliquidWsProvider>()
  private initPromises = new Map<string, Promise<HyperliquidWsProvider>>()

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

  private async getOrCreateProvider(
    provider: string
  ): Promise<HyperliquidWsProvider> {
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

  private async initProvider(provider: string): Promise<HyperliquidWsProvider> {
    const [{ providers }, { markets }] = await Promise.all([
      getProviders(this.client),
      getMarkets(this.client, { provider }),
    ])

    const providerInfo = providers.find((d) => d.key === provider)
    if (!providerInfo?.wsUrl) {
      throw new Error(`No WebSocket URL found for provider: ${provider}`)
    }

    const assetIdLookup = new Map<string, number>()
    for (const m of markets) {
      assetIdLookup.set(m.symbol, m.assetId)
    }

    const allVenues = (providerInfo.extraData?.venues ?? []) as Array<{
      name: string
    }>
    const configuredVenues = this.client.config.providers?.hyperliquid?.venues
    const filteredVenues = configuredVenues
      ? allVenues.filter((v) => configuredVenues.includes(v.name))
      : allVenues
    const subProviders = filteredVenues
      .map((v) => v.name)
      .filter((n) => n !== '')

    const wsProvider = new HyperliquidWsProvider(
      providerInfo.wsUrl,
      provider,
      assetIdLookup,
      subProviders
    )
    this.providers.set(provider, wsProvider)
    return wsProvider
  }
}
