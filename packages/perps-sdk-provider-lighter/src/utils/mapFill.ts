import {
  classifyFillFromPosition,
  ExplorerChainId,
  explorerTxUrl,
} from '@lifi/perps-sdk'
import type { Fill, MarketDisplay } from '@lifi/perps-types'
import {
  FillStatus,
  LiquidityRole,
  OrderSide,
  OrderType,
} from '@lifi/perps-types'
import Big from 'big.js'
import type { LtTrade } from '../types/index.js'

/**
 * Realized PnL on a position-reducing fill, derived from the pre-trade entry
 * basis. Returns `undefined` for opens/increases (nothing closes) or when the
 * entry-quote snapshot is absent, and `null` when the closed portion realizes
 * exactly zero — mirroring the Hyperliquid mapper's `null`-for-zero convention.
 */
const deriveRealizedPnl = (
  startPosition: string,
  entryQuoteBefore: string | undefined,
  fillSize: string,
  fillPrice: string,
  isBuyer: boolean
): string | null | undefined => {
  if (entryQuoteBefore === undefined) {
    return undefined
  }
  const start = new Big(startPosition)
  if (start.eq(0)) {
    return undefined
  }
  const isLong = start.gt(0)
  const reducing = isLong ? !isBuyer : isBuyer
  if (!reducing) {
    return undefined
  }

  const absStart = start.abs()
  const fill = new Big(fillSize)
  // A fill larger than the open size flips the position; only the portion that
  // unwinds the existing position realizes PnL.
  const closedSize = fill.gt(absStart) ? absStart : fill
  const avgEntry = new Big(entryQuoteBefore).abs().div(absStart)
  const price = new Big(fillPrice)
  const pnl = isLong
    ? price.minus(avgEntry).times(closedSize)
    : avgEntry.minus(price).times(closedSize)
  return pnl.eq(0) ? null : pnl.toString()
}

/**
 * Map a raw Lighter trade to the generic Fill type.
 * @param accountIndex - The viewer's Lighter account index (selects buy/sell side and maker/taker role).
 * @param market - Backend-resolved market identity for `trade.market_id`.
 * @public
 */
export const mapFill = (
  trade: LtTrade,
  accountIndex: number,
  market: MarketDisplay
): Fill => {
  const isBuyer = trade.bid_account_id === accountIndex
  const isMaker =
    (trade.is_maker_ask && !isBuyer) || (!trade.is_maker_ask && isBuyer)

  // Lighter publishes both counterparties' position-before snapshots on every
  // trade row; reading the wrong one mis-classifies when they differ.
  const startPosition = isMaker
    ? trade.maker_position_size_before
    : trade.taker_position_size_before
  const entryQuoteBefore = isMaker
    ? trade.maker_entry_quote_before
    : trade.taker_entry_quote_before
  const feeAmount = isMaker
    ? trade.maker_fee?.toString()
    : trade.taker_fee?.toString()

  return {
    id: trade.trade_id.toString(),
    orderId: String(isBuyer ? trade.bid_id : trade.ask_id),
    market,
    side: isBuyer ? OrderSide.BUY : OrderSide.SELL,
    type: OrderType.LIMIT,
    size: trade.size,
    price: trade.price,
    status: FillStatus.FILLED,
    liquidity: isMaker ? LiquidityRole.MAKER : LiquidityRole.TAKER,
    // Lighter charges the fill fee in the market's quote asset.
    fee:
      feeAmount === undefined
        ? undefined
        : { amount: feeAmount, asset: market.quoteAsset.displaySymbol },
    realizedPnl: deriveRealizedPnl(
      startPosition,
      entryQuoteBefore,
      trade.size,
      trade.price,
      isBuyer
    ),
    startPosition,
    // `classifyFillFromPosition` takes an HL-encoded side: `'B'` for buy,
    // anything else for sell.
    classification: classifyFillFromPosition(
      startPosition,
      isBuyer ? 'B' : 'A',
      trade.size
    ),
    createdAt: new Date(trade.timestamp).toISOString(),
    explorerLink: explorerTxUrl(ExplorerChainId.LIGHTER, trade.tx_hash),
  }
}
