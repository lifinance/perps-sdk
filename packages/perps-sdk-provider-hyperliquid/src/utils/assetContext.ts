import {
  getAssets as coreGetAssets,
  type PerpsSDKClient,
  type SDKRequestOptions,
} from '@lifi/perps-sdk'
import type { AssetDisplay } from '@lifi/perps-types'
import { MAIN_DEX_NAME, MAIN_MARKET_ID, PROVIDER_KEY } from '../constants.js'

/**
 * Market metadata an account-level read needs to fan out and enrich, sourced
 * once from the LI.FI backend's `/perps/assets` route (Valkey-cached) rather
 * than fetched direct from Hyperliquid. Account reads only hit HL directly for
 * the user's own state (clearinghouseState, frontendOpenOrders, userFills, …).
 */
export interface HlAssetContext {
  /**
   * Wire `dex` names for the `clearinghouseState` fan-out. Main perps is the
   * empty string (no `dex` param); sub-dexes carry their name. `'spot'` is
   * excluded — it has no clearinghouseState.
   */
  dexNames: string[]
  /** `assetId → AssetDisplay` for enriching positions / orders / fills. */
  byAssetId: Map<string, AssetDisplay>
  /** `providerMarketId → quote asset` for per-market balance currencies. */
  quoteByMarket: Map<string, string>
}

export const buildAssetContext = async (
  client: PerpsSDKClient,
  options?: SDKRequestOptions
): Promise<HlAssetContext> => {
  const { assets } = await coreGetAssets(
    client,
    { provider: PROVIDER_KEY },
    options
  )
  const dexNameSet = new Set<string>()
  const byAssetId = new Map<string, AssetDisplay>()
  const quoteByMarket = new Map<string, string>()
  for (const a of assets) {
    if (a.market !== 'spot') {
      dexNameSet.add(a.market === MAIN_MARKET_ID ? MAIN_DEX_NAME : a.market)
      if (a.displayQuote !== null) {
        quoteByMarket.set(a.market, a.displayQuote)
      }
    }
    byAssetId.set(a.assetId, {
      assetId: a.assetId,
      market: a.market,
      displaySymbol: a.displaySymbol,
      displayQuote: a.displayQuote,
    })
  }
  return { dexNames: [...dexNameSet], byAssetId, quoteByMarket }
}

/**
 * Enrich a raw `AssetDisplay` (assetId only, from a wire shape) with the
 * backend-sourced display fields. Falls back to the assetId itself when the
 * asset is unknown (e.g. a freshly listed market not yet in the cached list).
 */
export const enrichAsset = (
  assetId: string,
  ctx: HlAssetContext
): AssetDisplay =>
  ctx.byAssetId.get(assetId) ?? {
    assetId,
    market: '',
    displaySymbol: assetId,
    displayQuote: null,
  }
