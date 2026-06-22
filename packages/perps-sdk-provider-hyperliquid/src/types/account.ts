// Account-level types returned by Hyperliquid `/info`.

/** @public */
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

/** @public */
export type HlAssetPosition = {
  position: HlPosition
}

/** @public */
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

/** @public */
export type HlSpotBalance = {
  coin: string
  token: number
  total: string
  hold: string
  entryNtl: string
}

/** @public */
export type HlSpotClearinghouseState = {
  balances: HlSpotBalance[]
}

/** @public */
export type HlUserFees = {
  userAddRate: string
  userCrossRate: string
  activeReferralDiscount: string
}

/** @public */
export type HlExtraAgents = Record<string, unknown>[]

/**
 * Possible values returned by the `userAbstraction` info endpoint.
 * `null` means abstraction has never been set (standard mode).
 * @public
 */
export const HlAbstractionMode = {
  DISABLED: 'disabled',
  UNIFIED_ACCOUNT: 'unifiedAccount',
  PORTFOLIO_MARGIN: 'portfolioMargin',
  DEX_ABSTRACTION: 'dexAbstraction',
} as const

/** @public */
export type HlAbstractionMode =
  (typeof HlAbstractionMode)[keyof typeof HlAbstractionMode]
