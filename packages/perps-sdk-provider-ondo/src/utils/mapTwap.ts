import { toMarketDisplay } from '@lifi/perps-sdk'
import {
  type Market,
  OrderSide,
  type TwapOrder,
  TwapOrderStatus,
} from '@lifi/perps-types'
import Big from 'big.js'
import type { OndoTwapOrder } from '../types/wire.js'

/** Map an Ondo running-TWAP response row to the shared model. */
export const mapRunningTwap = (
  order: OndoTwapOrder,
  market: Market
): TwapOrder => {
  const filledSize = new Big(order.filledSize)
  return {
    twapId: order.twapId,
    market: toMarketDisplay(market),
    side: order.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
    totalSize: order.size,
    filledSize: order.filledSize,
    ...(filledSize.eq(0)
      ? {}
      : {
          avgFillPrice: new Big(order.filledCost).div(filledSize).toString(),
        }),
    startedAt: new Date(order.createdAt).toISOString(),
    durationSeconds: order.runningTime,
    status: TwapOrderStatus.RUNNING,
  }
}
