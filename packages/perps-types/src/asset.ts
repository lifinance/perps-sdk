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
}

/**
 * On-chain ERC-20 token a client bridges in to fund a perps account — the
 * deposit/collateral currency for a venue. Distinct from a category's
 * {@link ProviderCategory.quoteAsset}: the quote asset is the pricing/quote
 * unit a market is denominated in, whereas this is the concrete token the
 * deposit flow bridges to. Today all live venues settle in USDC and the two
 * coincide, but they are not the same concept and may diverge. Unlike
 * {@link Asset} (a provider-native registry entry keyed by an opaque
 * provider id), this carries full on-chain identity — chain, address, and
 * decimals — so the client can construct the bridge target directly.
 * @public
 */
export interface DepositAsset {
  /**
   * Settlement chain id the token lives on, aligned to `@lifi/types` `ChainId`
   * values. The alignment is documentation-level, not a type dependency.
   */
  chainId: number
  /** ERC-20 contract address on {@link DepositAsset.chainId}. */
  address: Address
  /** ERC-20 decimals, used to scale bridge amounts. */
  decimals: number
  displaySymbol: string
  logoURI: string
  displayName?: string
}

/** @public */
export interface AssetsResponse {
  assets: Asset[]
}
