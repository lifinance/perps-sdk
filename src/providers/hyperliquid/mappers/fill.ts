import {
  FillClassification,
  FillStatus,
  OrderSide,
  OrderType,
} from '../../../enums.js'
import type { Fill } from '../../../account.js'
import type { HlUserFill } from '../types.js'

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

export const mapFill = (fill: HlUserFill, providerKey: string): Fill => ({
  id: String(fill.tid),
  symbol: fill.coin,
  providerAssetId: fill.coin,
  provider: providerKey,
  side: fill.side === 'B' ? OrderSide.BUY : OrderSide.SELL,
  type: fill.dir?.includes('Limit') ? OrderType.LIMIT : OrderType.MARKET,
  size: fill.sz,
  price: fill.px,
  status: FillStatus.FILLED,
  filledSize: fill.sz,
  fee: fill.fee,
  realizedPnl: fill.closedPnl === '0' ? null : fill.closedPnl,
  startPosition: fill.startPosition,
  // TODO: Spot detection via "/" in coin name is brittle — needs a proper
  // asset-type field from the provider or a lookup-based approach.
  classification: fill.coin.includes('/')
    ? fill.side === 'B'
      ? FillClassification.SPOT_BUY
      : FillClassification.SPOT_SELL
    : classifyFillFromPosition(fill.startPosition, fill.side, fill.sz),
  createdAt: new Date(fill.time).toISOString(),
})
