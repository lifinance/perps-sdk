/**
 * Underlying token/registry entry. The base entity of the perps taxonomy:
 * a tradable unit referenced by markets (as base/quote legs) and held by
 * accounts (as balances). NOT a market — see {@link BaseMarket}.
 */
export interface Asset {
  providerId: string
  /** Own provider-minted id (Lighter's numeric `asset_id` stringified; HL coin symbol). */
  id: string
  displaySymbol: string
  logoURI: string
  displayName?: string
}

export interface AssetsResponse {
  assets: Asset[]
}
