import { safeSubtractDecimalString } from '@lifi/perps-sdk'
import type { Fill, MarketDisplay } from '@lifi/perps-types'
import { FillClassification, LiquidityRole, OrderSide } from '@lifi/perps-types'
import type { OndoFill, OndoFillDirection } from '../types/wire.js'
import { rowTimestampToIsoStringOrWarn } from './venueValues.js'

const DIRECTION_CLASSIFICATIONS: Record<OndoFillDirection, FillClassification> =
  {
    openLong: FillClassification.OPENED_LONG,
    openShort: FillClassification.OPENED_SHORT,
    closeLong: FillClassification.CLOSED_LONG,
    closeShort: FillClassification.CLOSED_SHORT,
    flipLongToShort: FillClassification.SWITCHED_SHORT,
    flipShortToLong: FillClassification.SWITCHED_LONG,
  }

/** Ondo's `fee` net of `feeRebate`, or `undefined` when either is malformed. */
const netFeeAmount = (fill: OndoFill): string | undefined =>
  safeSubtractDecimalString(fill.fee, fill.feeRebate ?? '0')

/**
 * Map a raw Ondo fill to the generic {@link Fill}. The fee is netted against
 * Ondo's `feeRebate`; when the wire `direction` is absent the classification
 * is the bare fill side. Size and price are the raw venue strings. A fill
 * with an invalid time gives `undefined`.
 *
 * @param market - Backend-resolved market identity for `fill.market`.
 * @public
 */
export const mapFill = (
  fill: OndoFill,
  market: MarketDisplay
): Fill | undefined => {
  const createdAt = rowTimestampToIsoStringOrWarn('fill', 'time', fill.time)
  if (createdAt === undefined) {
    return undefined
  }
  const feeAmount = netFeeAmount(fill)
  return {
    id: fill.id,
    orderId: fill.orderId,
    clientOrderId: fill.clientOrderId,
    market,
    side: fill.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
    size: fill.size,
    price: fill.price,
    liquidity: fill.isMaker ? LiquidityRole.MAKER : LiquidityRole.TAKER,
    // Ondo charges the fill fee in the market's quote asset.
    fee:
      feeAmount === undefined
        ? undefined
        : { amount: feeAmount, asset: market.quoteAsset.displaySymbol },
    realizedPnl: fill.pnl,
    classification:
      fill.direction !== undefined
        ? DIRECTION_CLASSIFICATIONS[fill.direction]
        : fill.side === 'buy'
          ? FillClassification.BUY
          : FillClassification.SELL,
    createdAt,
  }
}
