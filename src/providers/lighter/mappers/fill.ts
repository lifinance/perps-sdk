import {
  FillStatus,
  LiquidityRole,
  OrderSide,
  OrderType,
} from '../../../enums.js'
import type { Fill } from '../../../account.js'
import type { LtTrade } from '../apiTypes.js'
import { classifyFillFromPosition } from '../../_shared/fillClassification.js'

/**
 * Map a raw Lighter trade to the generic Fill type.
 * @param trade - Raw trade from REST or WS
 * @param accountIndex - The viewer's Lighter account index (to determine buy/sell side)
 * @param symbol - Resolved symbol (market_id → symbol lookup)
 */
export const mapFill = (
  trade: LtTrade,
  accountIndex: number,
  symbol: string
): Fill => {
  const isBuyer = trade.bid_account_id === accountIndex
  const isMaker =
    (trade.is_maker_ask && !isBuyer) || (!trade.is_maker_ask && isBuyer)

  // Pick the position-before snapshot that corresponds to the viewer's role
  // on this fill. Lighter publishes both counterparties' snapshots on every
  // trade row (see `LtTrade` comments); reading the wrong one would
  // mis-classify whenever the maker and taker are in different position
  // states (e.g. counterparty long, viewer flat).
  const startPosition = isMaker
    ? trade.maker_position_size_before
    : trade.taker_position_size_before

  return {
    id: trade.trade_id.toString(),
    orderId: String(isBuyer ? trade.bid_id : trade.ask_id),
    asset: {
      assetId: symbol,
      market: 'lighter',
      displaySymbol: symbol,
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
    // Hyperliquid-style classification: the shared helper consumes a signed
    // `startPosition` and an HL-encoded side (`'B'` = buy, anything else =
    // sell). Both providers reuse it so the Open/Close/Increase/Reduce/
    // Switch taxonomy stays consistent across the activity feed.
    classification: classifyFillFromPosition(
      startPosition,
      isBuyer ? 'B' : 'A',
      trade.size
    ),
    createdAt: new Date(trade.timestamp).toISOString(),
  }
}
