// Account-level types returned by Hyperliquid `/info`.

/**
 * Perpetual position payload from Hyperliquid `clearinghouseState`.
 *
 * Numeric values are decimal strings in quote-asset units except `szi`,
 * which is signed size: positive for long and negative for short. `coin` is
 * the Hyperliquid wire market identifier; `leverage.type` is typically
 * `'cross'` or `'isolated'`.
 * @public
 */
export type HlPosition = {
  /** Hyperliquid wire market identifier. */
  coin: string
  /** Signed position size; positive is long and negative is short. */
  szi: string
  /** Average entry price as a decimal string. */
  entryPx: string
  /** Position notional value as a decimal string. */
  positionValue: string
  /** Estimated liquidation price; may be an empty string when unavailable. */
  liquidationPx: string
  /** Unrealized PnL in quote-asset units. */
  unrealizedPnl: string
  /** Margin currently assigned to this position. */
  marginUsed: string
  /** Leverage mode and numeric leverage multiplier. */
  leverage: {
    type: string
    value: number
  }
  /**
   * Cumulative funding over three windows, in quote-asset units. Hyperliquid
   * reports funding the account PAID as positive — the opposite sign to the
   * `userFunding` ledger's `usdc` delta. `sinceOpen` resets when the position
   * returns to flat; `sinceChange` resets when its size changes.
   */
  cumFunding: {
    allTime: string
    sinceOpen: string
    sinceChange: string
  }
}

/**
 * Wrapper for a position in the `assetPositions` array of a clearinghouse
 * state response.
 * @public
 */
export type HlAssetPosition = {
  position: HlPosition
}

/**
 * Perpetual clearinghouse account state returned by Hyperliquid `/info`.
 * `assetPositions` includes zero-size rows that callers may discard. Monetary
 * fields are decimal strings in the account's quote asset; `marginSummary`
 * covers all positions while `crossMarginSummary` covers cross margin only.
 * @public
 */
export type HlClearinghouseState = {
  assetPositions: HlAssetPosition[]
  marginSummary: {
    accountValue: string
    totalMarginUsed: string
  }
  crossMarginSummary: {
    accountValue: string
    totalMarginUsed: string
  }
}

/**
 * One spot balance from Hyperliquid `spotClearinghouseState`.
 * `token` is the numeric spot token index, and amounts are decimal strings in
 * the token's native units.
 * @public
 */
export type HlSpotBalance = {
  coin: string
  token: number
  total: string
  hold: string
  entryNtl: string
}

/**
 * Spot clearinghouse state returned by Hyperliquid `/info`.
 * @public
 */
export type HlSpotClearinghouseState = {
  balances: HlSpotBalance[]
}

/**
 * User fee rates returned by Hyperliquid `userFees`.
 * Rates are decimal fractions represented as strings, not percentage values
 * (for example, `'0.00045'` is 0.045%).
 * @public
 */
export type HlUserFees = {
  userAddRate: string
  userCrossRate: string
  activeReferralDiscount: string
}

/**
 * Entries returned by Hyperliquid `extraAgents`. The endpoint may add fields
 * over time, so the provider retains each entry as an open record.
 * @public
 */
export type HlExtraAgents = Record<string, unknown>[]

/**
 * Response of the `preTransferCheck` info query. `userExists` is `false` until
 * the account's first deposit (which pays the one-time creation `fee`); only
 * `userExists` is read here.
 * @public
 */
export type HlPreTransferCheck = {
  userExists: boolean
}

/**
 * `activeAssetData` info response: the user's live per-asset trading state.
 * `leverage` reflects the venue-stored setting whether or not a position is
 * open on the asset.
 * @public
 */
export type HlActiveAssetData = {
  user: string
  coin: string
  leverage: { type: 'cross' | 'isolated'; value: number }
  maxTradeSzs: [string, string]
  availableToTrade: [string, string]
  markPx: string
}

/**
 * Possible values returned by the `userAbstraction` info endpoint.
 * `null` means abstraction has never been set; `'default'`/`'disabled'` are
 * the live and legacy spellings of standard (non-abstracted) mode.
 * @public
 */
export const HlAbstractionMode = {
  DEFAULT: 'default',
  DISABLED: 'disabled',
  UNIFIED_ACCOUNT: 'unifiedAccount',
  PORTFOLIO_MARGIN: 'portfolioMargin',
  DEX_ABSTRACTION: 'dexAbstraction',
} as const

/** Union of the exact `userAbstraction` wire values accepted by Hyperliquid. @public */
export type HlAbstractionMode =
  (typeof HlAbstractionMode)[keyof typeof HlAbstractionMode]
