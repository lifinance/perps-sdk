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
 * An external, on-chain ERC-20 token a client bridges/swaps INTO to fund an
 * account at a venue — the destination of a LI.FI route (its `toChain` /
 * `toToken`). The source token is arbitrary: LI.FI routes whatever the user
 * holds to this target, so only the target is described here. How the venue
 * represents the credited balance internally is deliberately not modeled —
 * the balance surfaces in-venue once the deposit arrives.
 *
 * Distinct from a category's {@link ProviderCategory.quoteAsset} (the
 * pricing/quote unit a market is denominated in): all live venues settle in
 * USDC today so the two coincide, but they are different concepts and may
 * diverge. Unlike {@link Asset} (a provider-native registry entry keyed by an
 * opaque provider id), this carries full on-chain identity — chain, address,
 * decimals — so the client can construct the route target directly.
 * @public
 */
export interface DepositAsset {
  /**
   * Chain the token lives on. MUST be a `@lifi/types` `ChainId` value — it is
   * passed verbatim as the LI.FI `getQuote` `toChain`.
   */
  chainId: number
  /**
   * Canonical ERC-20 contract on {@link DepositAsset.chainId} — the LI.FI
   * route target (`toToken`).
   */
  address: Address
  /** ERC-20 decimals, used to scale route amounts. */
  decimals: number
  displaySymbol: string
  logoURI: string
  displayName?: string
}

/** @public */
export interface AssetsResponse {
  assets: Asset[]
}
