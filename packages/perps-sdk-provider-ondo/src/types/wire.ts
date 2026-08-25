/**
 * Ondo REST wire types (`Ondo*`), mirroring the Ondo Perps OpenAPI schemas.
 * All numeric quantities arrive as strings; timestamps are ISO 8601 strings
 * unless a field says otherwise.
 */

/** Cursor pair Ondo returns as a sibling of `result` on paginated endpoints. */
export interface OndoPageInfo {
  prevCursor?: string
  nextCursor?: string
}

/**
 * `POST /v1/api_keys` result. The HMAC key is revealed only at creation and
 * arrives as `secretKey`; the boundary maps it to the stored `OndoApiKey`
 * domain record's `apiSecret`. @public
 */
export interface OndoCreatedApiKey {
  keyId: string
  name: string
  createdAt: string
  scopes: string[]
  secretKey: string
}

/** @public */
export type OndoPositionDirection = 'long' | 'short' | 'neutral'

/** Mirrors Ondo's `ApiPosition`. @public */
export interface OndoPosition {
  market: string
  direction: OndoPositionDirection
  /** Position size in base currency (unsigned magnitude). */
  netQuantity: string
  averageEntryPrice: string
  usedMargin: string
  unrealizedPnl: string
  markPrice: string
  liquidationPrice: string
  bankruptcyPrice: string
  maintenanceMargin: string
  notionalValue: string
  leverage: string
  /**
   * Net funding accrued since the position last left neutral. Signed like
   * {@link OndoFundingFeeTransfer.amount}: positive = earned, negative = paid.
   */
  netFundingSinceNeutral: string
  returnOnEquity: string
  stopLossTriggerPrice?: string
  takeProfitTriggerPrice?: string
}

/** @public */
export type OndoOrderSide = 'buy' | 'sell'

/** @public */
export type OndoOrderStatus =
  | 'open'
  | 'fullyfilled'
  | 'canceled'
  | 'pending'
  | 'untriggered'

/** @public */
export type OndoOrderType =
  | 'limit'
  | 'market'
  | 'stopMarket'
  | 'takeProfitMarket'

/** @public */
export type OndoTimeInForce = 'GTC' | 'IOC'

/** @public */
export type OndoStopOrderType = 'stopLoss' | 'takeProfit'

/** Mirrors Ondo's `ApiOrder`. @public */
export interface OndoOrder {
  orderId: string
  side: OndoOrderSide
  price: string
  size: string
  market: string
  filledSize: string
  lastFillSize: string
  filledCost: string
  fee: string
  status: OndoOrderStatus
  createdAt: string
  type: OndoOrderType
  clientOrderId?: string
  parentOrderId?: string
  realizedPnl?: string
  feeRebate?: string
  filledAt?: string
  canceledAt?: string
  cancelReason?: string
  /** Not returned for market orders. */
  timeInForce?: OndoTimeInForce
  reduceOnly?: boolean
  liquidationId?: string
  /** Position-level TP/SL flag. */
  closePosition?: boolean
  stopOrderType?: OndoStopOrderType
  triggerPrice?: string
}

/**
 * Mirrors Ondo's `TWAPOrderApiResp`, returned by
 * `GET /v1/perps/twap/orders/running`, `GET /v1/perps/twap/orders/history` and
 * `GET /v1/perps/twap/order/{orderID}`. @public
 */
export interface OndoTwapOrder {
  twapId: string
  market: string
  side: OndoOrderSide
  startTime: string
  /** Requested execution duration in seconds. */
  runningTime: number
  /** Child-order interval in seconds. */
  frequency: number
  /** Volume-weighted average child-fill price; `'0'` before the first fill. */
  avgFilledPrice: string
  filledSize: string
  totalSize: string
  totalFees: string
  /** The venue declares no enum for this field; `'running'` on the running feed. */
  orderStatus: string
  reduceOnly: boolean
  finishTime?: string
  maxPrice?: string
  minPrice?: string
  successfulOrders?: number
  failedOrders?: number
  twapCancelReason?: 0 | 1 | 2
  lastChildOrderError?: string
}

/** @public */
export type OndoFillDirection =
  | 'openLong'
  | 'openShort'
  | 'closeLong'
  | 'closeShort'
  | 'flipLongToShort'
  | 'flipShortToLong'

/** Mirrors Ondo's `ApiFill`. @public */
export interface OndoFill {
  id: string
  orderId: string
  market: string
  price: string
  size: string
  side: OndoOrderSide
  filledCost: string
  fee: string
  time: string
  isMaker: boolean
  clientOrderId?: string
  parentOrderID?: string
  direction?: OndoFillDirection
  feeRebate?: string
  pnl?: string
  isADL?: boolean
}

/**
 * Mirrors Ondo's `MarginAccountBalanceSummary`. Invariants per the docs:
 * `marginBalance = walletBalance + unrealizedPnl`,
 * `availableMargin = marginBalance − usedMargin`.
 * @public
 */
export interface OndoBalanceSummary {
  walletBalance: string
  realizedPnl: string
  unrealizedPnl: string
  marginBalance: string
  usedMargin: string
  availableMargin: string
  withdrawableMargin: string
  maintenanceMarginRequirement: string
  totalMaintenanceMargin: string
  marginRatio: string
  leverage: string
  underLiquidation: boolean
  totalFundingPayments: string
  totalTradingFees: string
  totalPnL: string
}

/**
 * `GET /v1/account/referral` result: the referral applied to the account.
 * The endpoint is absent from Ondo's published OpenAPI spec; shape mirrors the
 * venue web app. `result` is `null` when no referral is applied.
 * @public
 */
export interface OndoAccountReferral {
  /** The referrer's code applied to this account. */
  code: string
  /** Rebate share of trading fees returned to the referred account. */
  rebate?: number
}

/** Mirrors Ondo's `Contract` (perps contract ticker row). @public */
export interface OndoContract {
  market: string
  productType: string
  contractType: string
  baseCurrency: string
  quoteCurrency: string
  disabled: boolean
  displayName?: string
  lastPrice?: string
  indexPrice?: string
  fundingRate?: string
  nextFundingRate?: string
  nextFundingRateTimestamp?: string
  makerFee?: string
  takerFee?: string
  openInterest?: string
  openInterestUsd?: string
  priceChangePercent?: string
  isClosed?: boolean
}

/** Mirrors Ondo's `FundingFeeTransfer`. Carries no id — callers synthesize one. @public */
export interface OndoFundingFeeTransfer {
  market: string
  time: string
  markPrice: string
  positionSize: string
  positionDirection: OndoPositionDirection
  rate: string
  /** Which side paid this interval. */
  payer: OndoPositionDirection
  /** Signed: positive = earned, negative = paid. */
  amount: string
}

/** @public */
export type OndoLiquidationStatus = 'queued' | 'start' | 'retry' | 'stop'

/** Mirrors Ondo's `LiquidationEvent`. @public */
export interface OndoLiquidationEvent {
  id: string
  time: string
  initiatedAt: string
  accountId: string
  status: OndoLiquidationStatus
  insuranceFundUsed: string
  adl: boolean
  retryCount: number
  triggeringPositions?: OndoPosition[]
  filledQuoteSize?: string
  filledQuantity?: string
  reclaimOrderMargin?: boolean
}

/** @public */
export type OndoAccountState = 'open' | 'disabled' | 'offboarding' | 'closed'

/** Mirrors Ondo's `AccountInfo` (the `/v1/account` result). @public */
export interface OndoAccountInfo {
  accountID: string
  identifier: string
  authType: string
  accountState: OndoAccountState
  withdrawalFeeUSD: string
  termsVersion: number
  termsUnixSecs: number
  privacyVersion: number
  privacyUnixSecs: number
  marketingConsent: string
}
