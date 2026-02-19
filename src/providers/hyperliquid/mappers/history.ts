import { HistoryItemStatus, OrderSide, OrderType } from '../../../enums.js'
import type { HistoryItem } from '../../../account.js'
import type { HlUserFill } from '../types.js'

import { resolveAssetIdFromLookup } from './shared.js'

export const mapHistoryItem = (
  fill: HlUserFill,
  dexKey: string,
  assetIdLookup: Map<string, number>
): HistoryItem => ({
  id: String(fill.tid),
  symbol: fill.coin,
  assetId: resolveAssetIdFromLookup(assetIdLookup, fill.coin),
  dex: dexKey,
  side: fill.side === 'B' ? OrderSide.BUY : OrderSide.SELL,
  type: fill.dir?.includes('Limit') ? OrderType.LIMIT : OrderType.MARKET,
  size: fill.sz,
  price: fill.px,
  status: HistoryItemStatus.FILLED,
  filledSize: fill.sz,
  fee: fill.fee,
  realizedPnl: fill.closedPnl === '0' ? null : fill.closedPnl,
  createdAt: new Date(fill.time).toISOString(),
})
