import { PerpsError, triggerConditionFor } from '@lifi/perps-sdk'
import type {
  MarketDisplay,
  Order,
  OrderBase,
  TriggerOrder,
} from '@lifi/perps-types'
import {
  OrderSide,
  OrderStatus,
  OrderType,
  PerpsErrorCode,
  TimeInForce,
} from '@lifi/perps-types'
import Big from 'big.js'
import { PROVIDER_KEY } from '../constants.js'
import type {
  HlFrontendOpenOrder,
  HlOrderDetail,
  HlTwapHistoryEntry,
} from '../types/index.js'

/** Order payload shared by frontend, historical, and single-order reads. */
export type HlOrderLike = HlFrontendOpenOrder | HlOrderDetail['order']

/** Translate documented venue execution types without reading trigger prose. */
export const mapOrderType = (
  orderType: string
): Exclude<OrderType, OrderType.TWAP> => {
  switch (orderType) {
    case 'Take Profit Market':
      return OrderType.TAKE_PROFIT_MARKET
    case 'Take Profit Limit':
      return OrderType.TAKE_PROFIT_LIMIT
    case 'Stop Market':
      return OrderType.STOP_MARKET
    case 'Stop Limit':
      return OrderType.STOP_LIMIT
    case 'Market':
      return OrderType.MARKET
    case 'Limit':
      return OrderType.LIMIT
    default:
      throw venueError(`Unknown Hyperliquid order type: ${orderType}`)
  }
}

/** Translate venue lifecycle statuses; unknown statuses are errors. */
export const mapOrderStatus = (status: string): OrderStatus => {
  switch (status) {
    case 'open':
      return OrderStatus.OPEN
    case 'filled':
      return OrderStatus.FILLED
    case 'canceled':
    case 'scheduledCancel':
    case 'marginCanceled':
    case 'vaultWithdrawalCanceled':
    case 'openInterestCapCanceled':
    case 'selfTradeCanceled':
    case 'reduceOnlyCanceled':
    case 'siblingFilledCanceled':
    case 'delistedCanceled':
    case 'liquidatedCanceled':
      return OrderStatus.CANCELLED
    case 'rejected':
    case 'tickRejected':
    case 'minTradeNtlRejected':
    case 'perpMarginRejected':
    case 'reduceOnlyRejected':
    case 'badAloPxRejected':
    case 'iocCancelRejected':
    case 'badTriggerPxRejected':
    case 'marketOrderNoLiquidityRejected':
    case 'positionIncreaseAtOpenInterestCapRejected':
    case 'positionFlipAtOpenInterestCapRejected':
    case 'tooAggressiveAtOpenInterestCapRejected':
    case 'openInterestIncreaseRejected':
    case 'insufficientSpotBalanceRejected':
    case 'oracleRejected':
    case 'perpMaxPositionRejected':
      return OrderStatus.REJECTED
    case 'triggered':
      return OrderStatus.TRIGGERED
    default:
      throw venueError(`Unknown Hyperliquid order status: ${status}`)
  }
}

function venueError(message: string): PerpsError {
  const error = new PerpsError(PerpsErrorCode.ThirdPartyError, message)
  error.tool = PROVIDER_KEY
  return error
}

/** Normalize regular, trigger, and TWAP rows through one lifecycle model. */
export const mapOrder = (
  raw: HlOrderLike | HlOrderDetail | HlTwapHistoryEntry,
  market: MarketDisplay,
  parentOrderId?: string
): Order => {
  if ('state' in raw) {
    if (raw.twapId === undefined) {
      throw venueError('Hyperliquid returned a TWAP without a twapId.')
    }
    const { state } = raw
    const filled = new Big(state.executedSz)
    let status: OrderStatus
    switch (raw.status.status) {
      case 'activated':
        status = filled.gt(0) ? OrderStatus.PARTIALLY_FILLED : OrderStatus.OPEN
        break
      case 'waitingForTrigger':
        status = OrderStatus.OPEN
        break
      case 'finished':
        status = OrderStatus.FILLED
        break
      case 'terminated':
      case 'stopped':
        status = OrderStatus.CANCELLED
        break
      case 'error':
        status = OrderStatus.REJECTED
        break
      default:
        throw venueError(
          `Unknown Hyperliquid TWAP status: ${raw.status.status}`
        )
    }
    return {
      orderId: String(raw.twapId),
      market,
      type: OrderType.TWAP,
      side: state.side === 'B' ? OrderSide.BUY : OrderSide.SELL,
      originalSize: state.sz,
      remainingSize: new Big(state.sz).minus(filled).toFixed(),
      filledSize: state.executedSz,
      ...(filled.eq(0)
        ? {}
        : { averagePrice: new Big(state.executedNtl).div(filled).toFixed() }),
      reduceOnly: state.reduceOnly,
      status,
      ...(status === OrderStatus.CANCELLED || status === OrderStatus.REJECTED
        ? { statusReason: raw.status.description ?? raw.status.status }
        : {}),
      createdAt: new Date(state.timestamp).toISOString(),
      updatedAt: new Date(raw.time * 1000).toISOString(),
      startedAt: new Date(state.timestamp).toISOString(),
      durationSeconds: state.minutes * 60,
    }
  }
  const o = 'order' in raw ? raw.order : raw
  const venueStatus = 'order' in raw ? raw.status : 'open'
  const filled = new Big(o.origSz).minus(o.sz)
  let status = mapOrderStatus(venueStatus)
  if (parentOrderId !== undefined && !('order' in raw)) {
    status = OrderStatus.PENDING
  } else if (status === OrderStatus.OPEN && filled.gt(0)) {
    status = OrderStatus.PARTIALLY_FILLED
  }
  const base: OrderBase = {
    orderId: String(o.oid),
    market,
    ...(typeof o.cloid === 'string' ? { clientOrderId: o.cloid } : {}),
    side: o.side === 'B' ? OrderSide.BUY : OrderSide.SELL,
    status,
    ...(status === OrderStatus.CANCELLED || status === OrderStatus.REJECTED
      ? { statusReason: venueStatus }
      : {}),
    originalSize: o.origSz,
    remainingSize: o.sz,
    filledSize: filled.toFixed(),
    reduceOnly: o.reduceOnly,
    ...(parentOrderId === undefined ? {} : { parentOrderId }),
    createdAt: new Date(o.timestamp).toISOString(),
    updatedAt: new Date(
      'order' in raw ? raw.statusTimestamp : o.timestamp
    ).toISOString(),
  }
  let type = mapOrderType(o.orderType)
  if (o.isTrigger && (type === OrderType.MARKET || type === OrderType.LIMIT)) {
    if (o.tpsl === undefined) {
      throw venueError('Hyperliquid trigger order has no tpsl discriminator.')
    }
    type =
      o.tpsl === 'tp'
        ? type === OrderType.MARKET
          ? OrderType.TAKE_PROFIT_MARKET
          : OrderType.TAKE_PROFIT_LIMIT
        : type === OrderType.MARKET
          ? OrderType.STOP_MARKET
          : OrderType.STOP_LIMIT
  }
  if (type !== OrderType.MARKET && type !== OrderType.LIMIT) {
    const triggerType: TriggerOrder['type'] = type
    if (o.triggerPx === null) {
      throw venueError('Hyperliquid trigger order has no trigger price.')
    }
    return {
      ...base,
      type: triggerType,
      triggerPrice: o.triggerPx,
      triggerCondition: triggerConditionFor(triggerType, base.side),
      ...(type === OrderType.STOP_LIMIT || type === OrderType.TAKE_PROFIT_LIMIT
        ? { limitPrice: o.limitPx }
        : {}),
    }
  }
  let timeInForce: TimeInForce
  switch (o.tif) {
    case 'Ioc':
    case 'FrontendMarket':
      timeInForce = TimeInForce.IOC
      break
    case 'Alo':
      timeInForce = TimeInForce.POST_ONLY
      break
    case 'Gtc':
    case null:
    case undefined:
      timeInForce =
        type === OrderType.MARKET ? TimeInForce.IOC : TimeInForce.GTC
      break
    default:
      throw venueError(`Unknown Hyperliquid time in force: ${o.tif}`)
  }
  return { ...base, type, price: o.limitPx, timeInForce }
}
