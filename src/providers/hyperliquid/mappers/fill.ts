import {
  FillClassification,
  FillStatus,
  LiquidityRole,
  OrderSide,
  OrderType,
} from '../../../enums.js'
import type { Fill } from '../../../account.js'
import type { HlUserFill } from '../types.js'
import { assetIsSpot } from '../assetId.js'

export function classifyFillFromPosition(
  startPosition: string,
  side: string,
  sz: string
): FillClassification {
  const start = parseFloat(startPosition)
  const delta = side === 'B' ? parseFloat(sz) : -parseFloat(sz)
  const end = start + delta

  // Position was flat → opening
  if (start === 0) {
    return end > 0
      ? FillClassification.OPENED_LONG
      : FillClassification.OPENED_SHORT
  }

  // Position was long
  if (start > 0) {
    if (end === 0) {
      return FillClassification.CLOSED_LONG
    }
    if (end < 0) {
      return FillClassification.SWITCHED_SHORT
    }
    if (end > start) {
      return FillClassification.INCREASED_LONG
    }
    return FillClassification.REDUCED_LONG
  }

  // Position was short (start < 0)
  if (end === 0) {
    return FillClassification.CLOSED_SHORT
  }
  if (end > 0) {
    return FillClassification.SWITCHED_LONG
  }
  if (end < start) {
    return FillClassification.INCREASED_SHORT
  }
  return FillClassification.REDUCED_SHORT
}

export const mapFill = (fill: HlUserFill): Fill => ({
  id: String(fill.tid),
  orderId: String(fill.oid),
  asset: {
    assetId: fill.coin,
    market: '',
    displaySymbol: fill.coin,
    displayQuote: null,
  },
  side: fill.side === 'B' ? OrderSide.BUY : OrderSide.SELL,
  type: fill.dir?.includes('Limit') ? OrderType.LIMIT : OrderType.MARKET,
  size: fill.sz,
  price: fill.px,
  status: FillStatus.FILLED,
  liquidity: fill.crossed ? LiquidityRole.TAKER : LiquidityRole.MAKER,
  filledSize: fill.sz,
  fee: fill.fee,
  realizedPnl: fill.closedPnl === '0' ? null : fill.closedPnl,
  startPosition: fill.startPosition,
  classification: assetIsSpot(fill.coin)
    ? fill.side === 'B'
      ? FillClassification.SPOT_BUY
      : FillClassification.SPOT_SELL
    : classifyFillFromPosition(fill.startPosition, fill.side, fill.sz),
  createdAt: new Date(fill.time).toISOString(),
})
