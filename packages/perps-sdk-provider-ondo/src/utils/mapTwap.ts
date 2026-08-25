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
  return {
    twapId: order.twapId,
    market: toMarketDisplay(market),
    side: order.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
    totalSize: order.totalSize,
    filledSize: order.filledSize,
    // The venue reports `avgFilledPrice: '0'` before the first child fill,
    // where the shared model omits the field.
    ...(new Big(order.filledSize).eq(0)
      ? {}
      : { avgFillPrice: order.avgFilledPrice }),
    startedAt: new Date(order.startTime).toISOString(),
    durationSeconds: order.runningTime,
    status: TwapOrderStatus.RUNNING,
  }
}
