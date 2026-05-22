// ---------------------------------------------------------------------------
// Order shapes returned by Hyperliquid `/info`.
// ---------------------------------------------------------------------------

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
  isPositionTpsl: boolean
  triggerCondition: string
  triggerPx: string
  children: HlFrontendOpenOrder[]
  tif: string | null
  cloid: string | null
}

export type HlFrontendOpenOrders = HlFrontendOpenOrder[]

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
