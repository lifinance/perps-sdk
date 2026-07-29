/**
 * Underlying token/registry entry. The base entity of the perps taxonomy:
 * a tradable unit referenced by markets (as base/quote legs) and held by
 * accounts (as balances). NOT a market — see {@link BaseMarket}.
 * @public
 */
export interface Asset {
  providerId: string
  /**
   * The asset's own provider-native id. Lighter: numeric `asset_id`, stringified.
   * Hyperliquid spot: the venue token index (`spotMeta.tokens[].index`, the
   * value HL carries in a balance's `token` field) — identical to that token's
   * spot `Market.baseAsset.id`, so a held balance resolves to its market by
   * identity. NEVER the coin symbol (that is `displaySymbol`).
   */
  id: string
  displaySymbol: string
  logoURI: string
  displayName?: string
  /** Curated lowercase-kebab slugs for search and grouping (e.g. `'memory'`, `'metal'`, `'ai'`). */
  tags?: string[]
  /** Other venues' display symbols for the same real-world asset (e.g. Hyperliquid `SILVER` carries `['XAG']`). */
  aliases?: string[]
  /**
   * Precision the venue holds this asset at — the exponent an amount is
   * scaled by to reach the venue's integer wire value. Absent when the
   * provider publishes no per-asset precision.
   */
  decimals?: number
  /** Precision of the asset's L1 token contract, which need not match {@link Asset.decimals}. */
  l1Decimals?: number
  /** L1 token contract; the zero address denotes native gas. */
  l1Address?: string
  /** Venue minimum for a single withdrawal, denominated in this asset — not USD. */
  minWithdrawalAmount?: string
}

/** Response containing the provider's normalized asset registry. @public */
export interface AssetsResponse {
  assets: Asset[]
}
