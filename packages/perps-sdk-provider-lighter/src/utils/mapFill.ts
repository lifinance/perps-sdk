import { classifyFillFromPosition } from '@lifi/perps-sdk'
import type { Fill } from '@lifi/perps-types'
import {
  FillStatus,
  LiquidityRole,
  OrderSide,
  OrderType,
} from '@lifi/perps-types'
import type { LtTrade } from '../types/index.js'

/**
 * Map a raw Lighter trade to the generic Fill type.
 * @param accountIndex - The viewer's Lighter account index (selects buy/sell side and maker/taker role).
 * @param displaySymbol - Human-readable symbol for `asset.displaySymbol`.
 */
export const mapFill = (
  trade: LtTrade,
  accountIndex: number,
  displaySymbol: string
): Fill => {
  const isBuyer = trade.bid_account_id === accountIndex
  const isMaker =
    (trade.is_maker_ask && !isBuyer) || (!trade.is_maker_ask && isBuyer)

  // Lighter publishes both counterparties' position-before snapshots on every
  // trade row; reading the wrong one mis-classifies when they differ.
  const startPosition = isMaker
    ? trade.maker_position_size_before
    : trade.taker_position_size_before

  return {
    id: trade.trade_id.toString(),
    orderId: String(isBuyer ? trade.bid_id : trade.ask_id),
    asset: {
      assetId: String(trade.market_id),
      market: 'lighter',
      displaySymbol,
      displayQuote: 'USDC',
    },
    side: isBuyer ? OrderSide.BUY : OrderSide.SELL,
    type: OrderType.LIMIT,
    size: trade.size,
    price: trade.price,
    status: FillStatus.FILLED,
    liquidity: isMaker ? LiquidityRole.MAKER : LiquidityRole.TAKER,
    fee: isMaker ? trade.maker_fee?.toString() : trade.taker_fee?.toString(),
    startPosition,
    // `classifyFillFromPosition` takes an HL-encoded side: `'B'` for buy,
    // anything else for sell.
    classification: classifyFillFromPosition(
      startPosition,
      isBuyer ? 'B' : 'A',
      trade.size
    ),
    createdAt: new Date(trade.timestamp).toISOString(),
  }
}
