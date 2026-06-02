// Account-level types returned by Hyperliquid `/info`.

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

export type HlUserFees = {
  userAddRate: string
  userCrossRate: string
  activeReferralDiscount: string
}

export type HlExtraAgents = Record<string, unknown>[]

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
