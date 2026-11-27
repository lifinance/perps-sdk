// Extended REST response rows. Numbers above 2^53 (ids) arrive as decimal
// strings through `parseVenueJson`, so each id field is `string | number`.

type VenueId = string | number

/** `GET /api/v1/user/balance`. @public */
export interface ExtendedBalance {
  collateralName: string
  balance: string
  equity: string
  availableForTrade: string
  availableForWithdrawal: string
  unrealisedPnl: string
  initialMargin: string
  updatedTime: number
}

/** `GET /api/v1/user/positions`. @public */
export interface ExtendedPosition {
  id: VenueId
  market: string
  side: 'LONG' | 'SHORT'
  leverage: string
  size: string
  value: string
  openPrice: string
  markPrice: string
  liquidationPrice?: string
  margin: string
  unrealisedPnl: string
  realisedPnl: string
  createdTime: number
  updatedTime: number
}

/** Conditional-order trigger. @public */
export interface ExtendedOrderTrigger {
  triggerPrice: string
  triggerPriceType: string
  triggerPriceDirection: 'UP' | 'DOWN'
  executionPriceType: 'LIMIT' | 'MARKET'
}

/** One take-profit or stop-loss leg of a TPSL order. @public */
export interface ExtendedOrderTpslLeg {
  triggerPrice: string
  triggerPriceType: string
  price: string
  priceType: 'LIMIT' | 'MARKET'
}

/** `GET /api/v1/user/orders`, `/orders/history` and `/orders/{id}`. @public */
export interface ExtendedOrder {
  id: VenueId
  externalId?: string
  market: string
  type: 'LIMIT' | 'MARKET' | 'CONDITIONAL' | 'TPSL' | 'TWAP'
  side: 'BUY' | 'SELL'
  status: string
  statusReason?: string
  price?: string
  averagePrice?: string
  qty: string
  filledQty?: string
  reduceOnly?: boolean
  postOnly?: boolean
  trigger?: ExtendedOrderTrigger
  takeProfit?: ExtendedOrderTpslLeg
  stopLoss?: ExtendedOrderTpslLeg
  timeInForce: string
  createdTime: number
  updatedTime: number
  expireTime?: number
}

/** `GET /api/v1/user/trades`. @public */
export interface ExtendedTrade {
  id: VenueId
  market: string
  orderId: VenueId
  side: 'BUY' | 'SELL'
  price: string
  qty: string
  fee: string
  builderFee?: string
  isTaker: boolean
  tradeType: 'TRADE' | 'LIQUIDATION' | 'DELEVERAGE'
  createdTime: number
}

/** `GET /api/v1/user/assetOperations`. @public */
export interface ExtendedAssetOperation {
  id: VenueId
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' | 'CLAIM'
  status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED'
  amount: string
  fee: string
  time: number
  transactionHash?: string
  chain?: string
}

/**
 * A row of `GET /api/v1/user/funding/history`. `fundingFee` is negative when
 * the account paid and positive when it received. `size` is in the example
 * of the API docs but not in their field table. @public
 */
export interface ExtendedFundingPayment {
  id: VenueId
  market: string
  side: 'LONG' | 'SHORT'
  size?: string
  value: string
  markPrice: string
  fundingFee: string
  fundingRate: string
  paidTime: number
}

/** `GET /api/v1/user/leverage`. @public */
export interface ExtendedLeverage {
  market: string
  leverage: string
}
