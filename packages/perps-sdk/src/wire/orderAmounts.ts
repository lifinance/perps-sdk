import {
  type DecimalString,
  isDecimalString,
  type Market,
} from '@lifi/perps-types'
import Big from 'big.js'
import { TruncBig } from '../decimal/big.js'
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
  /** Truncated to `quoteDecimals`. */
  margin: DecimalString
  /** Snapped onto the venue lot grid. */
  size: DecimalString
  /** Truncated to `quoteDecimals`. */
  notional: DecimalString
}

const DEFAULT_QUOTE_DECIMALS = 2

/** Round a quote amount down onto its decimal grid, with no trailing zeros. */
function quoteAmount(value: Big, decimals: number): DecimalString {
  const truncated = value.round(decimals, Big.roundDown)
  return truncated.eq(0) ? '0' : truncated.toFixed()
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
 * with each other rather than with an input the user cannot see. Every
 * division truncates at 40 decimal places, so a held margin always funds the
 * size it buys: `size × price ≤ margin × leverage`.
 *
 * Formulas: `size = margin × leverage ÷ price`,
 * `margin = size × price ÷ leverage`, `notional = size × price`
 * (or `margin × leverage` when the margin is held).
 *
 * @returns `null` when `amount` or `price` is not a positive decimal string,
 *   or `leverage` is not a positive finite number.
 * @throws {PerpsError} `SDKError` when `market.providerId` names no registered
 *   provider plugin.
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

  if (held === 'size') {
    const size = snapOrderSize(sdk, market, amount.toFixed())
    const notional = new TruncBig(size).times(price)
    return {
      margin: quoteAmount(notional.div(leverage), quoteDecimals),
      size,
      notional: quoteAmount(notional, quoteDecimals),
    }
  }

  if (held === 'notional') {
    const notional = quoteAmount(amount, quoteDecimals)
    const exact = new TruncBig(notional)
    return {
      margin: quoteAmount(exact.div(leverage), quoteDecimals),
      size: snapOrderSize(sdk, market, exact.div(price).toFixed()),
      notional,
    }
  }

  const margin = quoteAmount(amount, quoteDecimals)
  const notional = new TruncBig(margin).times(leverage)
  return {
    margin,
    size: snapOrderSize(sdk, market, notional.div(price).toFixed()),
    notional: quoteAmount(notional, quoteDecimals),
  }
}
