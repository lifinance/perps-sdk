// Order shapes returned by Hyperliquid `/info`.

/**
 * Open order payload returned by Hyperliquid `frontendOpenOrders`.
 * Sizes/prices are decimal strings; timestamps are milliseconds. Trigger
 * flags and optional `children` describe attached TP/SL orders.
 * @public
 */
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
  isTrigger: boolean
  tpsl?: 'tp' | 'sl'
  isPositionTpsl: boolean
  triggerCondition: string
  triggerPx: string
  children?: HlFrontendOpenOrder[]
  tif: string | null
  cloid: string | null
}

/** Array returned by the `frontendOpenOrders` info query. @public */
export type HlFrontendOpenOrders = HlFrontendOpenOrder[]

/**
 * Order detail nested in an `orderStatus` response. `statusTimestamp` is the
 * last status-change time in milliseconds; `triggerPx` is nullable for orders
 * without a trigger.
 * @public
 */
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
    isTrigger?: boolean
    tpsl?: 'tp' | 'sl'
    children?: HlFrontendOpenOrder[]
    isPositionTpsl?: boolean
  }
  status: string
  statusTimestamp: number
}

/** Successful `orderStatus` response containing the requested order. @public */
export type HlOrderStatusFound = {
  status: 'order'
  order: HlOrderDetail
}

/**
 * Result of `orderStatus`: either a found order or the exact `'unknownOid'`
 * sentinel when Hyperliquid has no record for the numeric order ID.
 * @public
 */
export type HlOrderStatusResponse =
  | HlOrderStatusFound
  | { status: 'unknownOid' }

/** Rows returned by the `historicalOrders` info query. */
export type HlHistoricalOrders = HlOrderDetail[]

/** TWAP execution state returned by `twapHistory`; time uses epoch seconds. */
export interface HlTwapHistoryEntry {
  state: {
    coin: string
    executedNtl: string
    executedSz: string
    minutes: number
    side: string
    sz: string
    timestamp: number
    reduceOnly: boolean
  }
  status: { status: string; description?: string }
  time: number
  twapId?: number
}
