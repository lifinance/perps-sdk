import { toMarketDisplay } from '@lifi/perps-sdk'
import {
  type Market,
  OrderSide,
  type TwapOrder,
  TwapOrderStatus,
} from '@lifi/perps-types'
import Big from 'big.js'
import type { LtOrder } from '../types/order.js'

/** Map an active Lighter `twap` parent order to the shared running-TWAP model. */
export const mapRunningTwap = (order: LtOrder, market: Market): TwapOrder => {
  const filledSize = new Big(order.filled_base_amount)
  return {
    twapId: String(order.order_index),
    market: toMarketDisplay(market),
    side: order.is_ask ? OrderSide.SELL : OrderSide.BUY,
    totalSize: order.initial_base_amount,
    filledSize: order.filled_base_amount,
    ...(filledSize.eq(0)
      ? {}
      : {
          avgFillPrice: new Big(order.filled_quote_amount)
            .div(filledSize)
            .toString(),
        }),
    startedAt: new Date(order.created_at * 1000).toISOString(),
    durationSeconds: (order.order_expiry - order.created_at * 1000) / 1000,
    status: TwapOrderStatus.RUNNING,
  }
}
