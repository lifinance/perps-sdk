import { OrderSide, OrderType } from '../../../enums.js'
import type { OpenOrder } from '../../../account.js'
import type { LtOrder } from '../apiTypes.js'

const mapOrderType = (ltType: string): OrderType => {
  const map: Record<string, OrderType> = {
    limit: OrderType.LIMIT,
    market: OrderType.MARKET,
    stop_loss: OrderType.STOP_MARKET,
    stop_loss_limit: OrderType.STOP_LIMIT,
    take_profit: OrderType.TAKE_PROFIT_MARKET,
    take_profit_limit: OrderType.TAKE_PROFIT_LIMIT,
  }
  return map[ltType] ?? OrderType.LIMIT
}

/**
 * Map a raw Lighter order to the generic OpenOrder type.
 * @param order - Raw order from REST or WS
 * @param symbol - Resolved symbol (market_index → symbol lookup)
 */
export const mapOrder = (order: LtOrder, symbol: string): OpenOrder => ({
  id: order.order_id,
  asset: {
    assetId: symbol,
    market: 'lighter',
    displaySymbol: symbol,
    displayQuote: 'USDC',
  },
  side: order.is_ask ? OrderSide.SELL : OrderSide.BUY,
  type: mapOrderType(order.type),
  size: order.initial_base_amount,
  price: order.price,
  filledSize: order.filled_base_amount,
  reduceOnly: order.reduce_only,
  createdAt: new Date(order.created_at * 1000).toISOString(),
})
