import {
  isDecimalStringGreaterThan,
  PerpsError,
  subtractDecimalString,
  timestampToIsoString,
  triggerConditionFor,
  unknownToDecimalString,
} from '@lifi/perps-sdk'
import {
  type MarketDisplay,
  type Order,
  type OrderBase,
  OrderSide,
  OrderStatus,
  OrderType,
  PerpsErrorCode,
  TimeInForce,
  type TriggerOrder,
} from '@lifi/perps-types'
import { EXTENDED_PROVIDER_KEY } from '../constants.js'
import type { ExtendedOrder, ExtendedOrderTpslLeg } from '../types/wire.js'

const unsupported = (message: string): never => {
  throw new PerpsError(PerpsErrorCode.SDKError, message)
}

/** Map an Extended order status. An unknown status throws `SDKError`. @public */
export const mapOrderStatus = (status: string): OrderStatus => {
  switch (status) {
    case 'NEW':
    case 'UNTRIGGERED':
      return OrderStatus.OPEN
    case 'PARTIALLY_FILLED':
      return OrderStatus.PARTIALLY_FILLED
    case 'FILLED':
      return OrderStatus.FILLED
    case 'CANCELLED':
      return OrderStatus.CANCELLED
    case 'REJECTED':
      return OrderStatus.REJECTED
    case 'EXPIRED':
      return OrderStatus.EXPIRED
    case 'TRIGGERED':
      return OrderStatus.TRIGGERED
    default:
      return unsupported(`Unsupported Extended order status: ${status}`)
  }
}

const STATUS_REASONS: ReadonlyMap<string, string> = new Map([
  ['NOT_ENOUGH_FUNDS', 'The account has not enough margin.'],
  ['NO_LIQUIDITY', 'The market had no liquidity for the order.'],
  ['SELF_TRADE_PROTECTION', 'The order would have traded with your own order.'],
  ['POST_ONLY_FAILED', 'The post-only order would have traded immediately.'],
  [
    'REDUCE_ONLY_FAILED',
    'The reduce-only order would have increased the position.',
  ],
  ['INVALID_EXPIRE_TIME', 'The order expiry is not valid.'],
  ['INVALID_LEVERAGE', 'The order exceeds the market leverage.'],
  ['TPSL_OTHER_SIDE_FILLED', 'The other TP/SL leg filled.'],
  ['ORDER_REPLACED', 'A new version of the order replaced it.'],
  ['ACCOUNT_LIQUIDATION', 'The account was liquidated.'],
  ['REDUCE_ONLY_MODE', 'The market accepts only reduce-only orders.'],
  ['TRADING_OFF_MODE', 'Trading on the market is paused.'],
])

const statusReasonOf = (
  status: OrderStatus,
  reason: string | undefined
): string | undefined => {
  if (status !== OrderStatus.CANCELLED && status !== OrderStatus.REJECTED) {
    return undefined
  }
  if (reason === undefined || reason === 'NONE') {
    return status === OrderStatus.CANCELLED ? 'Cancelled.' : 'Rejected.'
  }
  return (
    STATUS_REASONS.get(reason) ??
    (status === OrderStatus.CANCELLED
      ? 'Cancelled by the venue.'
      : 'Rejected by the venue.')
  )
}

const mapTimeInForce = (order: ExtendedOrder): TimeInForce => {
  if (order.postOnly === true) {
    return TimeInForce.POST_ONLY
  }
  switch (order.timeInForce) {
    case 'GTT':
      return TimeInForce.GTT
    case 'IOC':
      return TimeInForce.IOC
    default:
      return unsupported(
        `Unsupported Extended time in force: ${order.timeInForce}`
      )
  }
}

const triggerType = (
  stopLoss: boolean,
  execution: 'LIMIT' | 'MARKET'
): TriggerOrder['type'] => {
  if (stopLoss) {
    return execution === 'LIMIT' ? OrderType.STOP_LIMIT : OrderType.STOP_MARKET
  }
  return execution === 'LIMIT'
    ? OrderType.TAKE_PROFIT_LIMIT
    : OrderType.TAKE_PROFIT_MARKET
}

const buildTriggerOrder = (
  base: OrderBase,
  type: TriggerOrder['type'],
  triggerPrice: string,
  limitPrice: string | undefined
): TriggerOrder => ({
  ...base,
  type,
  triggerPrice,
  triggerCondition: triggerConditionFor(type, base.side),
  ...(limitPrice === undefined ? {} : { limitPrice }),
})

const tpslLegOrder = (
  base: OrderBase,
  leg: ExtendedOrderTpslLeg,
  stopLoss: boolean
): TriggerOrder =>
  buildTriggerOrder(
    base,
    triggerType(stopLoss, leg.priceType),
    leg.triggerPrice,
    leg.priceType === 'LIMIT' ? leg.price : undefined
  )

/**
 * Map an Extended order row. A `TPSL` row gives one trigger order for each
 * leg, and both carry the venue id because one cancel removes both legs. A
 * `CONDITIONAL` row is a stop when its trigger moves against the order side:
 * a buy that triggers up, or a sell that triggers down. A `TWAP` row and an
 * unknown status throw `SDKError`, so the caller drops the row.
 *
 * @public
 */
export function mapOrder(order: ExtendedOrder, market: MarketDisplay): Order[] {
  if (order.type === 'TWAP') {
    return unsupported('Extended TWAP orders are not supported.')
  }
  const status = mapOrderStatus(order.status)
  const originalSize = unknownToDecimalString(
    order.qty,
    'qty',
    EXTENDED_PROVIDER_KEY
  )
  const filledSize = unknownToDecimalString(
    order.filledQty ?? '0',
    'filledQty',
    EXTENDED_PROVIDER_KEY
  )
  const statusReason = statusReasonOf(status, order.statusReason)
  const orderId = String(order.id)
  const base: OrderBase = {
    orderId,
    ...(order.externalId === undefined || order.externalId === orderId
      ? {}
      : { clientOrderId: order.externalId }),
    market,
    side: order.side === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
    status,
    ...(statusReason === undefined ? {} : { statusReason }),
    originalSize,
    remainingSize: subtractDecimalString(originalSize, filledSize),
    filledSize,
    ...(isDecimalStringGreaterThan(filledSize, '0') &&
    order.averagePrice !== undefined
      ? { averagePrice: order.averagePrice }
      : {}),
    reduceOnly: order.reduceOnly === true || order.type === 'TPSL',
    createdAt: timestampToIsoString(order.createdTime),
    updatedAt: timestampToIsoString(order.updatedTime),
  }

  if (order.type === 'TPSL') {
    const legs = [
      ...(order.takeProfit === undefined
        ? []
        : [tpslLegOrder(base, order.takeProfit, false)]),
      ...(order.stopLoss === undefined
        ? []
        : [tpslLegOrder(base, order.stopLoss, true)]),
    ]
    return legs.length > 0
      ? legs
      : unsupported(`Extended TPSL order ${orderId} has no leg.`)
  }

  if (order.type === 'CONDITIONAL') {
    const trigger =
      order.trigger ??
      unsupported(`Extended conditional order ${orderId} has no trigger.`)
    const stopLoss =
      (base.side === OrderSide.BUY) === (trigger.triggerPriceDirection === 'UP')
    return [
      buildTriggerOrder(
        base,
        triggerType(stopLoss, trigger.executionPriceType),
        trigger.triggerPrice,
        trigger.executionPriceType === 'LIMIT' ? order.price : undefined
      ),
    ]
  }

  return [
    {
      ...base,
      type: order.type === 'MARKET' ? OrderType.MARKET : OrderType.LIMIT,
      ...(order.price === undefined ? {} : { price: order.price }),
      timeInForce: mapTimeInForce(order),
      ...(order.timeInForce === 'GTT' && order.expireTime !== undefined
        ? { expiresAt: timestampToIsoString(order.expireTime) }
        : {}),
    },
  ]
}
