import {
  buildFill,
  isDecimalStringGreaterThan,
  timestampToIsoString,
} from '@lifi/perps-sdk'
import {
  type Fill,
  FillClassification,
  LiquidityRole,
  type MarketDisplay,
  OrderSide,
} from '@lifi/perps-types'
import type { ExtendedTrade } from '../types/wire.js'

/**
 * Map an Extended trade to a {@link Fill}. Extended charges the fee in the
 * market's quote asset. The trade does not say how it changed the position,
 * so the classification is the bare side.
 *
 * @public
 */
export const mapFill = (trade: ExtendedTrade, market: MarketDisplay): Fill => {
  const asset = market.quoteAsset.displaySymbol
  const isBuy = trade.side === 'BUY'
  return buildFill(
    {
      id: String(trade.id),
      orderId: String(trade.orderId),
      market,
      side: isBuy ? OrderSide.BUY : OrderSide.SELL,
      size: trade.qty,
      price: trade.price,
      liquidity: trade.isTaker ? LiquidityRole.TAKER : LiquidityRole.MAKER,
      fee: { amount: trade.fee, asset },
      ...(trade.builderFee !== undefined &&
      isDecimalStringGreaterThan(trade.builderFee, '0')
        ? { builderFee: { amount: trade.builderFee, asset } }
        : {}),
      classification: isBuy ? FillClassification.BUY : FillClassification.SELL,
      createdAt: timestampToIsoString(trade.createdTime),
    },
    undefined
  )
}
