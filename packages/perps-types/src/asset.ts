/**
 * Underlying token/registry entry. The base entity of the perps taxonomy:
 * a tradable unit referenced by markets (as base/quote legs) and held by
 * accounts (as balances). NOT a market — see {@link BaseMarket}.
 * @public
 */
export interface Asset {
  providerId: string
  /**
   * Own provider-minted id. Lighter: numeric `asset_id`, stringified.
   * Hyperliquid: the coin SYMBOL (e.g. "PURR") — identical to that token's
   * spot `Market.baseAsset.id`, so a held balance resolves to its market by
   * identity. NEVER the HL numeric token index.
   */
  id: string
  displaySymbol: string
  logoURI: string
  displayName?: string
}

/** @public */
export interface AssetsResponse {
  assets: Asset[]
}
