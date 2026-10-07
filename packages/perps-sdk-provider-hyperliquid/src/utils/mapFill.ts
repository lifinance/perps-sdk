import {
  classifyFillFromPosition,
  ExplorerChainId,
  explorerTxUrl,
  warnSkippedVenueRow,
} from '@lifi/perps-sdk'
import type { Fill, MarketDisplay } from '@lifi/perps-types'
import {
  FillClassification,
  LiquidityRole,
  OrderSide,
  OrderType,
} from '@lifi/perps-types'
import { PROVIDER_KEY, SPOT_MARKET_ID } from '../constants.js'
import type { HlUserFill } from '../types/index.js'
import { rowTimestampToIsoStringOrUndefined } from './rowTimestamp.js'

/** Re-export the shared fill-position classifier used by Hyperliquid mappings. @public */
export { classifyFillFromPosition }

/**
 * Spot-ness comes from the resolved market's category, not the coin string —
 * HL's canonical spot pair 0 is addressed as `PURR/USDC`, not `@0`. A fill with
 * an invalid time gives `undefined`.
 * @public
 */
export const mapFill = (
  fill: HlUserFill,
  market: MarketDisplay
): Fill | undefined => {
  const size = fill.sz
  const createdAt = rowTimestampToIsoStringOrUndefined(fill.time)
  if (createdAt === undefined) {
    warnSkippedVenueRow(PROVIDER_KEY, 'fill', 'time', fill.time, 'timestamp')
    return undefined
  }
  // HL charges the builder portion in the same token as the total fee.
  const feeAsset = fill.feeToken ?? market.quoteAsset.displaySymbol
  const side = fill.side === 'B' ? OrderSide.BUY : OrderSide.SELL

  return {
    ...(market.categoryId === SPOT_MARKET_ID
      ? { realizedPnl: fill.closedPnl }
      : { realizedPnl: fill.closedPnl === '0' ? null : fill.closedPnl }),
    id: String(fill.tid),
    orderId: String(fill.oid),
    clientOrderId: fill.cloid,
    market,
    side,
    // HL fills don't carry the originating order type. A maker fill (crossed:
    // false) can only come from a resting order, so it's necessarily a limit;
    // a taker fill (crossed: true) may be a market OR an aggressive limit order,
    // which the payload can't distinguish, so the type is left undefined.
    type: fill.crossed ? undefined : OrderType.LIMIT,
    size,
    price: fill.px,
    liquidity: fill.crossed ? LiquidityRole.TAKER : LiquidityRole.MAKER,
    filledSize: size,
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
        ? side === OrderSide.BUY
          ? FillClassification.SPOT_BUY
          : FillClassification.SPOT_SELL
        : classifyFillFromPosition(fill.startPosition, side, size),
    createdAt,
  }
}
