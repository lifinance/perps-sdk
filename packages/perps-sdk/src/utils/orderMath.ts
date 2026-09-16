import {
  OrderSide,
  OrderStatus,
  type Position,
  PositionSide,
  type RegularOrder,
  type TriggerOrder,
} from '@lifi/perps-types'
import { isActiveOrderStatus } from './orderClassification.js'
import { realizedPnlOnClose } from './positionMath.js'

/**
 * Pick the matching open position for an order's market, if any.
 *
 * @param marketId - The order's `market.id`.
 * @param positions - Open positions list (any market).
 * @public
 */
export function findMatchingPosition(
  marketId: string,
  positions: readonly Position[]
): Position | undefined {
  return positions.find((p) => p.market.id === marketId)
}

/**
 * Resolve the close-size against a position, applying the spec's cap rules:
 *  - `orderSize === 0` is the Hyperliquid convention for "close entire
 *    position" → close the full position size.
 *  - Otherwise cap at the absolute position size; an order larger than the
 *    position can only close what's open.
 *
 * Inputs are non-negative magnitudes.
 * @public
 */
export function resolveCloseSize(
  orderSize: number,
  positionSize: number
): number {
  if (orderSize === 0) {
    return positionSize
  }
  return Math.min(orderSize, positionSize)
}

/**
 * Expected rPnL for a resting limit order against a matching position.
 *
 * Reducing requires opposite sides (long position + SELL, short position +
 * BUY). Same-side orders add to the position and have no rPnL → `null`.
 * Projects `remainingSize`, because an already-filled quantity has realised
 * its PnL at the fill price rather than at this order's limit price. A
 * `remainingSize` of zero leaves nothing to project.
 *
 * @returns Realised PnL if the order would reduce the position, otherwise
 *   `null`.
 * @public
 */
export function expectedRealizedPnlForOpenOrder(
  order: RegularOrder,
  position: Position | undefined
): number | null {
  if (!position || !isActiveOrderStatus(order.status)) {
    return null
  }

  const isLong = position.side === PositionSide.LONG
  const reducesPosition =
    (isLong && order.side === OrderSide.SELL) ||
    (!isLong && order.side === OrderSide.BUY)
  if (!reducesPosition) {
    return null
  }

  const limitPrice = Number.parseFloat(order.price ?? '')
  const entryPrice = Number.parseFloat(position.entryPrice)
  const orderSize = Math.abs(Number.parseFloat(order.remainingSize))
  const positionSize = Math.abs(Number.parseFloat(position.size))
  if (
    !Number.isFinite(limitPrice) ||
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(orderSize) ||
    !Number.isFinite(positionSize) ||
    positionSize <= 0
  ) {
    return null
  }

  // `resolveCloseSize` reads a zero size as "close the whole position", a
  // convention that belongs to an order's submitted size. `remainingSize` is
  // the unfilled quantity, so zero means nothing is left to fill.
  if (orderSize === 0) {
    return null
  }

  const closeSize = resolveCloseSize(orderSize, positionSize)
  return realizedPnlOnClose({
    entryPrice,
    closePrice: limitPrice,
    closeSize,
    isLong,
  })
}

/** Project the unfilled closing quantity of an active trigger at its trigger price. */
export function expectedRealizedPnlForTriggerOrder(
  order: TriggerOrder,
  position: Position | undefined
): number | null {
  if (
    !position ||
    !isActiveOrderStatus(order.status) ||
    order.status === OrderStatus.PENDING
  ) {
    return null
  }

  const isLong = position.side === PositionSide.LONG
  if (
    (isLong && order.side !== OrderSide.SELL) ||
    (!isLong && order.side !== OrderSide.BUY)
  ) {
    return null
  }
  const triggerPrice = Number.parseFloat(order.triggerPrice)
  const entryPrice = Number.parseFloat(position.entryPrice)
  const orderSize = Math.abs(Number.parseFloat(order.remainingSize))
  const positionSize = Math.abs(Number.parseFloat(position.size))
  if (
    !Number.isFinite(triggerPrice) ||
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(orderSize) ||
    !Number.isFinite(positionSize) ||
    positionSize <= 0
  ) {
    return null
  }
  if (
    orderSize === 0 &&
    (Number.parseFloat(order.originalSize) !== 0 || !order.reduceOnly)
  ) {
    return null
  }

  const closeSize = resolveCloseSize(orderSize, positionSize)
  return realizedPnlOnClose({
    entryPrice,
    closePrice: triggerPrice,
    closeSize,
    isLong,
  })
}
