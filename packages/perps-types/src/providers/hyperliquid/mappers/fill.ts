import type { Fill } from '../../../account.js'
import {
  FillClassification,
  FillStatus,
  LiquidityRole,
  OrderSide,
  OrderType,
} from '../../../enums.js'
import { classifyFillFromPosition } from '../../_shared/fillClassification.js'
import { assetIsSpot } from '../assetId.js'
import type { HlUserFill } from '../types.js'
import { deriveMarket } from './_market.js'

export { classifyFillFromPosition }

export const mapFill = (fill: HlUserFill): Fill => ({
  id: String(fill.tid),
  orderId: String(fill.oid),
  asset: {
    assetId: fill.coin,
    market: deriveMarket(fill.coin),
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
