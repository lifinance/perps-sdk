import {
  absDecimalString,
  calculateRealizedPnl,
  classifyFillFromPosition,
  divideDecimalString,
  ExplorerChainId,
  explorerTxUrl,
  isDecimalString,
  isDecimalStringGreaterThan,
  isDecimalStringZero,
  safeAddDecimalString,
  safeDivideDecimalString,
  safeMultiplyDecimalString,
  warnSkippedVenueRow,
} from '@lifi/perps-sdk'
import type { Fill, MarketDisplay } from '@lifi/perps-types'
import { LiquidityRole, OrderSide, OrderType } from '@lifi/perps-types'
import { LIGHTER_FEE_TICK_SCALE, LIGHTER_PROVIDER_KEY } from '../constants.js'
import type { LtTrade } from '../types/index.js'
import { leverageFromScaledImf } from './mapPosition.js'
import { rowTimestampToIsoStringOrUndefined } from './rowTimestamp.js'
import { isPlaceholderTxHash } from './txHash.js'

/**
 * Fee charged on a fill, in the market's quote asset. Lighter publishes the
 * side's fee *rate* as an integer tick on `LIGHTER_FEE_TICK_SCALE` rather than
 * the amount it charged. A row can carry more than one tick for the same side,
 * so `amount = notional * sum(side ticks) / LIGHTER_FEE_TICK_SCALE`.
 *
 * The product keeps the sign of both inputs. A rebate tick therefore maps to a
 * negative amount, which `Fee.amount` permits and the Ondo mapper already emits
 * when a rebate exceeds the fee, so this helper never clamps the sign. A zero
 * notional charges a zero fee at every tick. A malformed notional gives
 * `undefined`.
 */
const tickToFeeAmount = (
  notional: string,
  ownTick: number,
  integratorTick: number | undefined
): string | undefined => {
  if (!isDecimalString(notional)) {
    return undefined
  }
  const tickSum = safeAddDecimalString(
    String(ownTick),
    String(integratorTick ?? 0)
  )
  const scaledFee =
    tickSum === undefined
      ? undefined
      : safeMultiplyDecimalString(notional, tickSum)
  return scaledFee === undefined
    ? undefined
    : safeDivideDecimalString(scaledFee, String(LIGHTER_FEE_TICK_SCALE))
}

/**
 * Display leverage the viewer had set on the market when the trade executed,
 * from the pre-trade initial margin fraction. Returns `undefined` when the
 * row omits the fraction.
 */
const leverageFromTradeImf = (imf: number | undefined): string | undefined =>
  imf === undefined ? undefined : leverageFromScaledImf(imf)

/**
 * Realized PnL on a position-reducing fill, derived from the pre-trade entry
 * basis. Returns `undefined` for opens/increases (nothing closes) or when the
 * entry-quote snapshot is absent or an input is malformed, and `null` when the
 * closed portion realizes exactly zero — mirroring the Hyperliquid mapper's
 * `null`-for-zero convention.
 */
const deriveRealizedPnl = (
  startPosition: string,
  entryQuoteBefore: string | undefined,
  fillSize: string,
  fillPrice: string,
  isBuyer: boolean
): string | null | undefined => {
  if (
    entryQuoteBefore === undefined ||
    ![startPosition, entryQuoteBefore, fillSize, fillPrice].every(
      isDecimalString
    )
  ) {
    return undefined
  }
  if (isDecimalStringZero(startPosition)) {
    return undefined
  }
  const isLong = isDecimalStringGreaterThan(startPosition, '0')
  const reducing = isLong ? !isBuyer : isBuyer
  if (!reducing) {
    return undefined
  }

  const absStart = absDecimalString(startPosition)
  // A fill larger than the open size flips the position; only the portion that
  // unwinds the existing position realizes PnL.
  const closedSize = isDecimalStringGreaterThan(fillSize, absStart)
    ? absStart
    : fillSize
  const pnl = calculateRealizedPnl({
    entryPrice: divideDecimalString(
      absDecimalString(entryQuoteBefore),
      absStart
    ),
    closePrice: fillPrice,
    closeSize: closedSize,
    isLong,
  })
  return isDecimalStringZero(pnl) ? null : pnl
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
): Fill | undefined => {
  const { size, price } = trade
  const createdAt = rowTimestampToIsoStringOrUndefined(trade.timestamp)
  if (createdAt === undefined) {
    warnSkippedVenueRow(
      LIGHTER_PROVIDER_KEY,
      'fill',
      'timestamp',
      trade.timestamp,
      { marketId: market.id, expected: 'timestamp' }
    )
    return undefined
  }
  const isBuyer = trade.bid_account_id === accountIndex
  const isMaker =
    (trade.is_maker_ask && !isBuyer) || (!trade.is_maker_ask && isBuyer)

  // Lighter publishes both counterparties' position-before snapshots on every
  // trade row; reading the wrong one mis-classifies when they differ.
  // Both keys are `omitempty`: an absent snapshot means flat.
  const startPosition =
    (isMaker
      ? trade.maker_position_size_before
      : trade.taker_position_size_before) ?? '0'
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
  const feeAmount =
    feeTick === undefined
      ? undefined
      : tickToFeeAmount(trade.usd_amount, feeTick, integratorFeeTick)

  return {
    id: trade.trade_id_str,
    orderId: isBuyer ? trade.bid_id_str : trade.ask_id_str,
    market,
    side: isBuyer ? OrderSide.BUY : OrderSide.SELL,
    type: OrderType.LIMIT,
    size,
    price,
    liquidity: isMaker ? LiquidityRole.MAKER : LiquidityRole.TAKER,
    // Lighter charges the fill fee in the market's quote asset.
    fee:
      feeAmount === undefined
        ? undefined
        : { amount: feeAmount, asset: market.quoteAsset.displaySymbol },
    leverage: leverageFromTradeImf(imfBefore),
    realizedPnl: deriveRealizedPnl(
      startPosition,
      entryQuoteBefore,
      size,
      price,
      isBuyer
    ),
    startPosition,
    classification: classifyFillFromPosition(
      startPosition,
      isBuyer ? OrderSide.BUY : OrderSide.SELL,
      size
    ),
    createdAt,
    explorerLink: isPlaceholderTxHash(trade.tx_hash)
      ? undefined
      : explorerTxUrl(ExplorerChainId.LIGHTER, trade.tx_hash),
  }
}
