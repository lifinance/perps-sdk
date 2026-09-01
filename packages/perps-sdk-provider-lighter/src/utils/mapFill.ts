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
import {
  LIGHTER_FEE_TICK_SCALE,
  LIGHTER_IMF_PERCENT_SCALE,
} from '../constants.js'
import type { LtTrade } from '../types/index.js'
import { leverageFromImf } from './mapPosition.js'

/**
 * Fee charged on a fill, in the market's quote asset. Lighter publishes the
 * side's fee *rate* as an integer tick on `LIGHTER_FEE_TICK_SCALE` rather than
 * the amount it charged. A row can carry more than one tick for the same side,
 * so `amount = notional * sum(side ticks) / LIGHTER_FEE_TICK_SCALE`.
 *
 * The product keeps the sign of both inputs. A rebate tick therefore maps to a
 * negative amount, which `Fee.amount` permits and the Ondo mapper already emits
 * when a rebate exceeds the fee, so this helper never clamps the sign. A zero
 * notional charges a zero fee at every tick.
 */
const tickToFeeAmount = (
  notional: string,
  ownTick: number,
  integratorTick: number | undefined
): string =>
  new Big(notional)
    .times(new Big(ownTick).plus(integratorTick ?? 0))
    .div(LIGHTER_FEE_TICK_SCALE)
    .toFixed()

/**
 * Display leverage the viewer had set on the market when the trade executed.
 * Lighter reports it as the pre-trade initial margin fraction, an integer
 * percent on `LIGHTER_IMF_PERCENT_SCALE`: `500` is 5.00%, so 20x. Returns
 * `undefined` when the row omits the fraction. Lighter declares the fraction a
 * `StrictInt`, so the scale division is exact and `toFixed()` loses nothing.
 */
const leverageFromTradeImf = (imf: number | undefined): number | undefined =>
  imf === undefined
    ? undefined
    : leverageFromImf(new Big(imf).div(LIGHTER_IMF_PERCENT_SCALE).toFixed())

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
  const feeTick = isMaker ? trade.maker_fee : trade.taker_fee
  const integratorFeeTick = isMaker
    ? trade.integrator_maker_fee
    : trade.integrator_taker_fee
  const imfBefore = isMaker
    ? trade.maker_initial_margin_fraction_before
    : trade.taker_initial_margin_fraction_before

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
      feeTick === undefined
        ? undefined
        : {
            amount: tickToFeeAmount(
              trade.usd_amount,
              feeTick,
              integratorFeeTick
            ),
            asset: market.quoteAsset.displaySymbol,
          },
    leverage: leverageFromTradeImf(imfBefore),
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
