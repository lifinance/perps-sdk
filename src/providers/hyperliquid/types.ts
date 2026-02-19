// ---------------------------------------------------------------------------
// Hyperliquid /info response types
// ---------------------------------------------------------------------------

// -- metaAndAssetCtxs -------------------------------------------------------

export type HlUniverseItem = {
  name: string
  szDecimals: number
  maxLeverage: number
  onlyIsolated: boolean
  isDelisted: boolean
}

export type HlMeta = {
  universe: HlUniverseItem[]
}

export type HlAssetCtx = {
  funding: string
  openInterest: string
  dayNtlVlm: string
  markPx: string
}

export type HlMetaAndAssetCtxs = [HlMeta, HlAssetCtx[]]

export type HlUniverse = HlMeta['universe']

// -- allMids ----------------------------------------------------------------

export type HlAllMids = Record<string, string>

// -- candleSnapshot ---------------------------------------------------------

export type HlCandle = {
  t: number
  o: string
  h: string
  l: string
  c: string
  v: string
}

export type HlCandleSnapshot = HlCandle[]

// -- l2Book -----------------------------------------------------------------

export type HlLevel = {
  px: string
  sz: string
  n: number
}

export type HlL2Book = {
  levels: [HlLevel[], HlLevel[]]
  time: number
}

// -- clearinghouseState -----------------------------------------------------

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

// -- frontendOpenOrders -----------------------------------------------------

export type HlFrontendOpenOrder = {
  oid: number
  coin: string
  side: string
  sz: string
  limitPx: string
  orderType: string
  origSz: string
  reduceOnly: boolean
  timestamp: number
}

export type HlFrontendOpenOrders = HlFrontendOpenOrder[]

// -- extraAgents ------------------------------------------------------------

export type HlExtraAgents = Record<string, unknown>[]

// -- userFills / userFillsByTime --------------------------------------------

export type HlUserFill = {
  tid: number
  coin: string
  side: string
  sz: string
  px: string
  dir: string
  fee: string
  closedPnl: string
  time: number
}

export type HlUserFills = HlUserFill[]

export type HlUserFillsByTime = HlUserFill[]

// -- orderStatus ------------------------------------------------------------

export type HlOrderDetail = {
  order: {
    oid: number
    coin: string
    side: string
    sz: string
    limitPx: string
    orderType: string
    origSz: string
    reduceOnly: boolean
    timestamp: number
    tif: string | null
    cloid: string | null
    triggerCondition: string
    triggerPx: string | null
  }
  status: string
  statusTimestamp: number
}

export type HlOrderStatusFound = {
  status: 'order'
  order: HlOrderDetail
}

export type HlOrderStatusResponse =
  | HlOrderStatusFound
  | { status: 'unknownOid' }

// -- perpDexs ---------------------------------------------------------------

export type HlPerpDexs = (null | { name: string })[]

// ---------------------------------------------------------------------------
// Exchange request / response types
// ---------------------------------------------------------------------------

export type HlExchangeRequest = {
  action: Record<string, unknown>
  signature: {
    r: string
    s: string
    v: number
  }
  nonce: number
  vaultAddress?: string | null
}

export type HlExchangeResponse = {
  status: string
  response?:
    | string
    | {
        type: string
        data?: {
          statuses?: (
            | string
            | { filled: { totalSz: string; avgPx: string; oid: number } }
            | { resting: { oid: number } }
            | { waitingForFill: { oid: number } }
            | { waitingForTrigger: { oid: number } }
            | { success: true }
            | { error: string }
          )[]
          status?: unknown
        }
      }
}
