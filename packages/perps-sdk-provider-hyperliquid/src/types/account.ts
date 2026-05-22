// ---------------------------------------------------------------------------
// Account-level types returned by Hyperliquid `/info`.
// ---------------------------------------------------------------------------

export type HlPosition = {
  coin: string
  szi: string
  entryPx: string
  positionValue: string
  liquidationPx: string
  unrealizedPnl: string
  marginUsed: string
  leverage: {
    type: string
    value: number
  }
}

export type HlAssetPosition = {
  position: HlPosition
}

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

// -- spotClearinghouseState -------------------------------------------------

export type HlSpotBalance = {
  coin: string
  token: number
  total: string
  hold: string
  entryNtl: string
}

export type HlSpotClearinghouseState = {
  balances: HlSpotBalance[]
}

// -- userFees ---------------------------------------------------------------

export type HlUserFees = {
  userAddRate: string
  userCrossRate: string
  activeReferralDiscount: string
}

// -- extraAgents ------------------------------------------------------------

export type HlExtraAgents = Record<string, unknown>[]

// -- userAbstraction --------------------------------------------------------

/**
 * Possible values returned by the `userAbstraction` info endpoint.
 * `null` means abstraction has never been set (standard mode).
 */
export const HlAbstractionMode = {
  DISABLED: 'disabled',
  UNIFIED_ACCOUNT: 'unifiedAccount',
  PORTFOLIO_MARGIN: 'portfolioMargin',
  DEX_ABSTRACTION: 'dexAbstraction',
} as const

export type HlAbstractionMode =
  (typeof HlAbstractionMode)[keyof typeof HlAbstractionMode]
