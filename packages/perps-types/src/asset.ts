import type { Address } from './primitives.js'

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
}

/**
 * An external, on-chain ERC-20 token a client bridges/swaps in to fund an
 * account at a venue — the collateral currency, described by its canonical
 * on-chain identity (a LI.FI-recognized token). The source token is arbitrary:
 * LI.FI routes whatever the user holds into this one, so only the target
 * currency is described here. How the venue represents the credited balance
 * internally is deliberately not modeled — it surfaces in-venue once the
 * deposit arrives.
 *
 * Distinct from a category's {@link ProviderCategory.quoteAsset} (the
 * pricing/quote unit a market is denominated in): all live venues settle in
 * USDC today so the two coincide, but they are different concepts and may
 * diverge. Unlike {@link Asset} (a provider-native registry entry keyed by an
 * opaque provider id), this carries full on-chain identity — chain, address,
 * decimals.
 * @public
 */
export interface DepositAsset {
  /**
   * The chain the ERC-20 contract lives on, aligned to `@lifi/types` `ChainId`
   * values (documentation-level, not a type dependency). This is the token's
   * on-chain home (e.g. Arbitrum for HL's USDC), NOT necessarily the LI.FI
   * deposit route's `toChain`: some venues route to a distinct LI.FI venue
   * chain (see the SDK's declared deposit assets), so the two may differ and
   * the client maps between them.
   */
  chainId: number
  /** ERC-20 contract address on {@link DepositAsset.chainId}. */
  address: Address
  /** ERC-20 decimals, used to scale deposit amounts. */
  decimals: number
  /** Display ticker for UI labels; same semantics as {@link Asset.displaySymbol}. */
  displaySymbol: string
  /** Token logo for UI; same semantics as {@link Asset.logoURI}. */
  logoURI: string
  /** Optional longer display name; same semantics as {@link Asset.displayName}. */
  displayName?: string
}

/** Response containing the provider's normalized asset registry. @public */
export interface AssetsResponse {
  assets: Asset[]
}
