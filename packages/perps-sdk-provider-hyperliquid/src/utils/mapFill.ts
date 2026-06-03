import { classifyFillFromPosition } from '@lifi/perps-sdk'
import type { Fill, MarketDisplay } from '@lifi/perps-types'
import {
  FillClassification,
  FillStatus,
  LiquidityRole,
  OrderSide,
  OrderType,
} from '@lifi/perps-types'
import type { HlUserFill } from '../types/index.js'
import { assetIsSpot } from './assetId.js'

export { classifyFillFromPosition }

/** @public */
export const mapFill = (fill: HlUserFill, market: MarketDisplay): Fill => ({
  id: String(fill.tid),
  orderId: String(fill.oid),
  market,
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
