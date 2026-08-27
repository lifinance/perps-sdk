import {
  classifyFillFromPosition,
  ExplorerChainId,
  explorerTxUrl,
} from '@lifi/perps-sdk'
import type { Fill, MarketDisplay } from '@lifi/perps-types'
import {
  FillClassification,
  FillStatus,
  LiquidityRole,
  OrderSide,
  OrderType,
} from '@lifi/perps-types'
import { SPOT_MARKET_ID } from '../constants.js'
import type { HlUserFill } from '../types/index.js'

/** Re-export the shared fill-position classifier used by Hyperliquid mappings. @public */
export { classifyFillFromPosition }

/**
 * Spot-ness comes from the resolved market's category, not the coin string —
 * HL's canonical spot pair 0 is addressed as `PURR/USDC`, not `@0`.
 * @public
 */
export const mapFill = (fill: HlUserFill, market: MarketDisplay): Fill => {
  // HL charges the builder portion in the same token as the total fee.
  const feeAsset = fill.feeToken ?? market.quoteAsset.displaySymbol

  return {
    ...(market.categoryId === SPOT_MARKET_ID
      ? { realizedPnl: fill.closedPnl }
      : { realizedPnl: fill.closedPnl === '0' ? null : fill.closedPnl }),
    id: String(fill.tid),
    orderId: String(fill.oid),
    clientOrderId: fill.cloid,
    market,
    side: fill.side === 'B' ? OrderSide.BUY : OrderSide.SELL,
    // HL fills don't carry the originating order type. A maker fill (crossed:
    // false) can only come from a resting order, so it's necessarily a limit;
    // a taker fill (crossed: true) may be a market OR an aggressive limit order,
    // which the payload can't distinguish, so the type is left undefined.
    type: fill.crossed ? undefined : OrderType.LIMIT,
    size: fill.sz,
    price: fill.px,
    status: FillStatus.FILLED,
    liquidity: fill.crossed ? LiquidityRole.TAKER : LiquidityRole.MAKER,
    filledSize: fill.sz,
    fee: {
      amount: fill.fee,
      asset: feeAsset,
    },
    builderFee:
      fill.builderFee === undefined
        ? undefined
        : { amount: fill.builderFee, asset: feeAsset },
    startPosition: fill.startPosition,
    explorerLink: explorerTxUrl(ExplorerChainId.HYPERLIQUID, fill.hash),
    classification:
      market.categoryId === SPOT_MARKET_ID
        ? fill.side === 'B'
          ? FillClassification.SPOT_BUY
          : FillClassification.SPOT_SELL
        : classifyFillFromPosition(fill.startPosition, fill.side, fill.sz),
    createdAt: new Date(fill.time).toISOString(),
  }
}
