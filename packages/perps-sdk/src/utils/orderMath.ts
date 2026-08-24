import {
  type OpenOrder,
  OrderSide,
  type Position,
  PositionSide,
  type TriggerOrder,
} from '@lifi/perps-types'
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
 * its PnL at the fill price rather than at this order's limit price.
 *
 * @returns Realised PnL if the order would reduce the position, otherwise
 *   `null`.
 * @public
 */
export function expectedRealizedPnlForOpenOrder(
  order: OpenOrder,
  position: Position | undefined
): number | null {
  if (!position) {
    return null
  }

  const isLong = position.side === PositionSide.LONG
  const reducesPosition =
    (isLong && order.side === OrderSide.SELL) ||
    (!isLong && order.side === OrderSide.BUY)
  if (!reducesPosition) {
    return null
  }

  const limitPrice = Number.parseFloat(order.price)
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

  const closeSize = resolveCloseSize(orderSize, positionSize)
  return realizedPnlOnClose({
    entryPrice,
    closePrice: limitPrice,
    closeSize,
    isLong,
  })
}

/**
 * Expected rPnL for a TP/SL trigger order against a matching position.
 *
 * A trigger order is by construction a closing leg — its direction is the
 * opposite of the position's. With no matching position there is nothing to
 * close, so rPnL is `null`. The trigger price (always present on the SDK
 * `TriggerOrder` shape) is used as the rPnL price; the optional `limitPrice`
 * for STOP_LIMIT / TAKE_PROFIT_LIMIT is the post-trigger limit, not the rPnL
 * price.
 * @public
 */
export function expectedRealizedPnlForTriggerOrder(
  order: TriggerOrder,
  position: Position | undefined
): number | null {
  if (!position) {
    return null
  }

  const isLong = position.side === PositionSide.LONG
  const triggerPrice = Number.parseFloat(order.triggerPrice)
  const entryPrice = Number.parseFloat(position.entryPrice)
  const orderSize = Math.abs(Number.parseFloat(order.size))
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

  const closeSize = resolveCloseSize(orderSize, positionSize)
  return realizedPnlOnClose({
    entryPrice,
    closePrice: triggerPrice,
    closeSize,
    isLong,
  })
}
