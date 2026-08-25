import type { Fill, MarketDisplay } from '@lifi/perps-types'
import {
  FillClassification,
  FillStatus,
  LiquidityRole,
  OrderSide,
} from '@lifi/perps-types'
import Big from 'big.js'
import type { OndoFill, OndoFillDirection } from '../types/wire.js'

const DIRECTION_CLASSIFICATIONS: Record<OndoFillDirection, FillClassification> =
  {
    openLong: FillClassification.OPENED_LONG,
    openShort: FillClassification.OPENED_SHORT,
    closeLong: FillClassification.CLOSED_LONG,
    closeShort: FillClassification.CLOSED_SHORT,
    flipLongToShort: FillClassification.SWITCHED_SHORT,
    flipShortToLong: FillClassification.SWITCHED_LONG,
  }

/**
 * Map a raw Ondo fill to the generic {@link Fill}. The fee is netted against
 * Ondo's `feeRebate`; when the wire `direction` is absent the classification
 * falls back to the fill side.
 *
 * @param market - Backend-resolved market identity for `fill.market`.
 * @public
 */
export const mapFill = (fill: OndoFill, market: MarketDisplay): Fill => ({
  id: fill.id,
  orderId: fill.orderId,
  market,
  side: fill.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
  size: fill.size,
  price: fill.price,
  status: FillStatus.FILLED,
  liquidity: fill.isMaker ? LiquidityRole.MAKER : LiquidityRole.TAKER,
  // Ondo charges the fill fee in the market's quote asset.
  fee: {
    amount: new Big(fill.fee).minus(fill.feeRebate ?? '0').toFixed(),
    asset: market.quoteAsset.displaySymbol,
  },
  realizedPnl: fill.pnl,
  classification:
    fill.direction !== undefined
      ? DIRECTION_CLASSIFICATIONS[fill.direction]
      : fill.side === 'buy'
        ? FillClassification.OPENED_LONG
        : FillClassification.OPENED_SHORT,
  createdAt: new Date(fill.time).toISOString(),
})
