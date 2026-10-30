import {
  classifyFillFromPosition,
  ExplorerChainId,
  explorerTxUrl,
  warnSkippedVenueRow,
} from '@lifi/perps-sdk'
import type { Fill, FillLiquidation, MarketDisplay } from '@lifi/perps-types'
import {
  FillClassification,
  LiquidationMethod,
  LiquidityRole,
  OrderSide,
} from '@lifi/perps-types'
import { zeroHash } from 'viem'
import { PROVIDER_KEY, SPOT_MARKET_ID } from '../constants.js'
import type { HlFillLiquidation, HlUserFill } from '../types/index.js'
import { rowTimestampToIsoStringOrUndefined } from './rowTimestamp.js'

/** Re-export the shared fill-position classifier used by Hyperliquid mappings. @public */
export { classifyFillFromPosition }

const mapLiquidationMethod = (
  method: string
): LiquidationMethod | undefined => {
  switch (method) {
    case 'market':
      return LiquidationMethod.MARKET
    case 'backstop':
      return LiquidationMethod.BACKSTOP
    default:
      return undefined
  }
}

// Hyperliquid attaches `liquidation` to the fills of both parties.
const mapFillLiquidation = (
  liquidation: HlFillLiquidation | undefined,
  address: string
): FillLiquidation | undefined => {
  if (
    liquidation === undefined ||
    liquidation.liquidatedUser.toLowerCase() !== address.toLowerCase()
  ) {
    return undefined
  }
  const method = mapLiquidationMethod(liquidation.method)
  return {
    ...(method === undefined ? {} : { method }),
    markPrice: liquidation.markPx,
  }
}

/** Maps a fill using the market category; the order type stays absent.
 * Invalid times return `undefined`. The venue does not report the order type.
 * @param address - Fill owner; only the liquidated account carries `liquidation`.
 * @public
 */
export const mapFill = (
  fill: HlUserFill,
  market: MarketDisplay,
  address: string
): Fill | undefined => {
  const size = fill.sz
  const createdAt = rowTimestampToIsoStringOrUndefined(fill.time)
  if (createdAt === undefined) {
    warnSkippedVenueRow(PROVIDER_KEY, 'fill', 'time', fill.time, {
      marketId: market.id,
      expected: 'timestamp',
    })
    return undefined
  }
  // HL charges the builder portion in the same token as the total fee.
  const feeAsset = fill.feeToken ?? market.quoteAsset.displaySymbol
  const side = fill.side === 'B' ? OrderSide.BUY : OrderSide.SELL
  const liquidation = mapFillLiquidation(fill.liquidation, address)

  return {
    ...(market.categoryId === SPOT_MARKET_ID
      ? { realizedPnl: fill.closedPnl }
      : { realizedPnl: fill.closedPnl === '0' ? null : fill.closedPnl }),
    id: String(fill.tid),
    orderId: String(fill.oid),
    clientOrderId: fill.cloid,
    market,
    side,
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
    // A TWAP slice fill carries the zero hash: no venue transaction to link.
    explorerLink: explorerTxUrl(
      ExplorerChainId.HYPERLIQUID,
      fill.hash === zeroHash ? undefined : fill.hash
    ),
    classification:
      market.categoryId === SPOT_MARKET_ID
        ? side === OrderSide.BUY
          ? FillClassification.SPOT_BUY
          : FillClassification.SPOT_SELL
        : classifyFillFromPosition(fill.startPosition, side, size),
    createdAt,
    ...(liquidation === undefined ? {} : { liquidation }),
  }
}
