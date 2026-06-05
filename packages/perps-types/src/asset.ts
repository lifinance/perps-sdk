/**
 * Underlying token/registry entry. The base entity of the perps taxonomy:
 * a tradable unit referenced by markets (as base/quote legs) and held by
 * accounts (as balances). NOT a market — see {@link BaseMarket}.
 * @public
 */
export interface Asset {
  providerId: string
  /** Own provider-minted id (Lighter's numeric `asset_id` stringified; HL spot's `spotMeta` token index, the id spot balances carry in their `token` field). */
  id: string
  displaySymbol: string
  logoURI: string
  displayName?: string
}

/** @public */
export interface AssetsResponse {
  assets: Asset[]
}
