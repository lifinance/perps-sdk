import {
  asDecimalString,
  asIsoTimestamp,
  isDecimalString,
  warnSkippedVenueRow,
} from '@lifi/perps-sdk'
import type { Fill, MarketDisplay } from '@lifi/perps-types'
import { FillClassification, LiquidityRole, OrderSide } from '@lifi/perps-types'
import Big from 'big.js'
import { ONDO_PROVIDER_KEY } from '../constants.js'
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

/** Ondo's `fee` net of `feeRebate`, or `undefined` when either is malformed. */
const netFeeAmount = (fill: OndoFill): string | undefined => {
  const rebate = fill.feeRebate ?? '0'
  return isDecimalString(fill.fee) && isDecimalString(rebate)
    ? new Big(fill.fee).minus(rebate).toFixed()
    : undefined
}

/**
 * Map a raw Ondo fill to the generic {@link Fill}. The fee is netted against
 * Ondo's `feeRebate`; when the wire `direction` is absent the classification
 * is the bare fill side. A fill with an invalid size, price or time gives
 * `undefined`.
 *
 * @param market - Backend-resolved market identity for `fill.market`.
 * @public
 */
export const mapFill = (
  fill: OndoFill,
  market: MarketDisplay
): Fill | undefined => {
  const size = asDecimalString(fill.size)
  if (size === undefined) {
    warnSkippedVenueRow(ONDO_PROVIDER_KEY, 'fill', 'size', fill.size)
    return undefined
  }
  const price = asDecimalString(fill.price)
  if (price === undefined) {
    warnSkippedVenueRow(ONDO_PROVIDER_KEY, 'fill', 'price', fill.price)
    return undefined
  }
  const createdAt = asIsoTimestamp(fill.time)
  if (createdAt === undefined) {
    warnSkippedVenueRow(
      ONDO_PROVIDER_KEY,
      'fill',
      'time',
      fill.time,
      'timestamp'
    )
    return undefined
  }
  const feeAmount = netFeeAmount(fill)
  return {
    id: fill.id,
    orderId: fill.orderId,
    clientOrderId: fill.clientOrderId,
    market,
    side: fill.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
    size,
    price,
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
