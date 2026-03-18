import type { Subscription } from '@lifi/perps-types'
import type { PerpsSDKClient } from '../client/createPerpsClient.js'
import { getDexes } from '../services/getDexes.js'
import { getMarkets } from '../services/getMarkets.js'
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
    const provider = await this.getOrCreateProvider(sub.dex)
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
    dex: string
  ): Promise<HyperliquidWsProvider> {
    const existing = this.providers.get(dex)
    if (existing) {
      return existing
    }

    let initPromise = this.initPromises.get(dex)
    if (!initPromise) {
      initPromise = this.initProvider(dex)
      this.initPromises.set(dex, initPromise)
    }
    return initPromise
  }

  private async initProvider(dex: string): Promise<HyperliquidWsProvider> {
    const [{ dexes }, { markets }] = await Promise.all([
      getDexes(this.client),
      getMarkets(this.client, { dex }),
    ])

    const dexInfo = dexes.find((d) => d.key === dex)
    if (!dexInfo?.wsUrl) {
      throw new Error(`No WebSocket URL found for dex: ${dex}`)
    }

    const assetIdLookup = new Map<string, number>()
    for (const m of markets) {
      assetIdLookup.set(m.symbol, m.assetId)
    }

    const venues = (dexInfo.extraData?.venues ?? []) as Array<{ name: string }>
    const subDexes = venues.map((v) => v.name).filter((n) => n !== '')

    const provider = new HyperliquidWsProvider(
      dexInfo.wsUrl,
      dex,
      assetIdLookup,
      subDexes
    )
    this.providers.set(dex, provider)
    return provider
  }
}
