import {
  type DecimalString,
  type Market,
  PerpsErrorCode,
} from '@lifi/perps-types'
import Big from 'big.js'
import { TruncBig } from '../decimal/big.js'
import { isDecimalString } from '../decimal/parse.js'
import { PerpsError } from '../errors/PerpsError.js'
import type { PerpsSDKClient } from '../types/provider.js'
import { snapOrderSize } from './snap.js'

/** @public */
export interface OrderAmountsInput {
  sdk: PerpsSDKClient
  market: Market
  /** The field the user typed; the other two are calculated from it. */
  held: 'margin' | 'size' | 'notional'
  amount: DecimalString
  leverage: number
  price: DecimalString
  /** Decimals for the quote-asset amounts (margin, notional). Default 2. */
  quoteDecimals?: number
}

/** @public */
export interface OrderAmounts {
  /**
   * On the `quoteDecimals` grid: rounded up when derived, so it funds `size`
   * at the requested leverage, and truncated when the user holds it.
   */
  margin: DecimalString
  /** Snapped onto the venue lot grid. */
  size: DecimalString
  /** Truncated to `quoteDecimals`. */
  notional: DecimalString
}

const DEFAULT_QUOTE_DECIMALS = 2
const TEN = new Big(10)

/** Round a quote amount down onto its decimal grid, with no trailing zeros. */
function quoteAmount(value: Big, decimals: number): DecimalString {
  const truncated = value.round(decimals, Big.roundDown)
  return truncated.eq(0) ? '0' : truncated.toFixed()
}

/**
 * The smallest margin on the `decimals` grid that funds `notional` at
 * `leverage`, so `margin × leverage ≥ notional` holds. The one derived amount
 * that rounds up: a margin rounded down under-funds the size it backs.
 *
 * The ceiling is exact: the remainder decides the carry, so the result never
 * leans on a fixed decimal-place limit the way `div` then `round` would.
 */
function coveringMargin(
  notional: Big,
  leverage: Big,
  decimals: number
): DecimalString {
  const scale = TEN.pow(decimals)
  const scaled = notional.times(scale)
  const remainder = scaled.mod(leverage)
  const whole = scaled.minus(remainder).div(leverage)
  const covering = remainder.eq(0) ? whole : whole.plus(1)
  return covering.eq(0) ? '0' : covering.div(scale).toFixed()
}

/**
 * An order needs three positive amounts. A grid that snaps any of them to
 * zero — a sub-lot size, a sub-cent quote amount — describes no order a venue
 * can take, so the caller gets `null` instead of a result it has to re-check.
 */
function executable(amounts: OrderAmounts): OrderAmounts | null {
  const positive =
    new Big(amounts.size).gt(0) &&
    new Big(amounts.margin).gt(0) &&
    new Big(amounts.notional).gt(0)
  return positive ? amounts : null
}

function positiveDecimal(value: DecimalString): Big | null {
  if (!isDecimalString(value)) {
    return null
  }
  const parsed = new TruncBig(value)
  return parsed.gt(0) ? parsed : null
}

/**
 * The three order-entry amounts, derived from whichever one the user typed.
 *
 * The held field is normalised first — truncated to `quoteDecimals` for a
 * margin or notional, snapped onto the venue lot grid for a size — and the
 * other two are then derived from that normalised value, so the three agree
 * with each other rather than with an input the user cannot see.
 *
 * Rounding is directional, so the result always funds itself:
 * `size × price ≤ margin × leverage`. A derived size truncates onto the lot
 * grid and a derived notional truncates onto the quote grid, but a derived
 * margin rounds **up** onto the quote grid, because it is the one amount that
 * has to cover the others rather than cap them.
 *
 * Formulas: `size = margin × leverage ÷ price`,
 * `margin = size × price ÷ leverage`, `notional = size × price`
 * (or `margin × leverage` when the margin is held).
 *
 * @returns `null` when `amount` or `price` is not a positive decimal string,
 *   when `leverage` is not a positive finite number, or when the venue and
 *   quote grids snap the result to a non-positive amount — a sub-lot size or
 *   a sub-cent quote amount describes no order a venue can take.
 * @throws {PerpsError} `ValidationError` when `quoteDecimals` is not a
 *   non-negative integer, or `SDKError` when `market.providerId` names no
 *   registered provider plugin.
 * @public
 */
export function calculateOrderAmounts(
  input: OrderAmountsInput
): OrderAmounts | null {
  const {
    sdk,
    market,
    held,
    leverage,
    quoteDecimals = DEFAULT_QUOTE_DECIMALS,
  } = input
  if (!Number.isInteger(quoteDecimals) || quoteDecimals < 0) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid quoteDecimals for order amounts: ${quoteDecimals}`
    )
  }
  const amount = positiveDecimal(input.amount)
  const price = positiveDecimal(input.price)
  if (
    amount === null ||
    price === null ||
    !Number.isFinite(leverage) ||
    leverage <= 0
  ) {
    return null
  }
  const leverageFactor = new TruncBig(leverage)

  if (held === 'size') {
    const size = snapOrderSize(sdk, market, amount.toFixed())
    const notional = new TruncBig(size).times(price)
    return executable({
      margin: coveringMargin(notional, leverageFactor, quoteDecimals),
      size,
      notional: quoteAmount(notional, quoteDecimals),
    })
  }

  if (held === 'notional') {
    const notional = quoteAmount(amount, quoteDecimals)
    const exact = new TruncBig(notional)
    return executable({
      margin: coveringMargin(exact, leverageFactor, quoteDecimals),
      size: snapOrderSize(sdk, market, exact.div(price).toFixed()),
      notional,
    })
  }

  const margin = quoteAmount(amount, quoteDecimals)
  const notional = new TruncBig(margin).times(leverage)
  return executable({
    margin,
    size: snapOrderSize(sdk, market, notional.div(price).toFixed()),
    notional: quoteAmount(notional, quoteDecimals),
  })
}
