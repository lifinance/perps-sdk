import type { DecimalString, Market } from '@lifi/perps-types'
import type Big from 'big.js'
import { DivBig, TruncBig } from '../decimal/big.js'
import { isDecimalStringZero } from '../decimal/compare.js'
import { isDecimalString } from '../decimal/parse.js'
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
}

/** @public */
export interface OrderAmounts {
  /**
   * The held `amount`, byte-identical, when the user holds the margin;
   * otherwise `notional ÷ leverage`, a display and comparison value that
   * never reaches a venue.
   */
  margin: DecimalString
  /** Snapped onto the venue lot grid; the one amount an order sends. */
  size: DecimalString
  /** Exactly `size × price`, from the snapped size. */
  notional: DecimalString
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
 * Only `size` snaps, onto the market's venue lot grid, because an order sends
 * size alone; no quote amount has a grid. A held margin returns byte-identical,
 * `notional` is the snapped size × price, and a derived margin is
 * `notional ÷ leverage` in `DivBig` (40 places, half-up).
 *
 * @returns `null` when `amount` or `price` is not a positive
 *   {@link DecimalString}, when `leverage` is not a positive finite number, or
 *   when the snapped size is zero (below one lot).
 * @throws {PerpsError} `SDKError` when `market.providerId` names no registered
 *   provider plugin.
 * @public
 */
export function calculateOrderAmounts(
  input: OrderAmountsInput
): OrderAmounts | null {
  const { sdk, market, held, leverage } = input
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

  const requested =
    held === 'size'
      ? input.amount
      : held === 'notional'
        ? amount.div(price).toFixed()
        : amount.times(leverage).div(price).toFixed()
  const size = snapOrderSize(sdk, market, requested)
  if (isDecimalStringZero(size)) {
    return null
  }

  const notional = new TruncBig(size).times(price)
  return {
    margin:
      held === 'margin'
        ? input.amount
        : new DivBig(notional).div(leverage).toFixed(),
    size,
    notional: notional.toFixed(),
  }
}
