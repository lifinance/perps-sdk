import {
  type DecimalString,
  type Market,
  PerpsErrorCode,
} from '@lifi/perps-types'
import type Big from 'big.js'
import { DivBig, TruncBig } from '../decimal/big.js'
import { isDecimalStringZero } from '../decimal/compare.js'
import { isDecimalString } from '../decimal/parse.js'
import { invalidInput } from '../errors/invalidInput.js'
import { PerpsError } from '../errors/PerpsError.js'
import type { PerpsSDKClient } from '../types/provider.js'
import { createSafeFunction } from '../utils/createSafeFunction.js'
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

function requirePositiveDecimal(value: DecimalString, parameter: string): Big {
  const parsed = isDecimalString(value) ? new TruncBig(value) : undefined
  if (parsed === undefined || !parsed.gt(0)) {
    throw invalidInput(
      parameter,
      `must be a positive decimal, got '${String(value)}'`
    )
  }
  return parsed
}

const lotSize = (market: Market): DecimalString =>
  market.sizeIncrement ?? new TruncBig(`1e-${market.szDecimals}`).toFixed()

/**
 * The three order-entry amounts, derived from whichever one the user typed.
 * Only `size` snaps, onto the market's venue lot grid, because an order sends
 * size alone; no quote amount has a grid. A held margin returns byte-identical,
 * `notional` is the snapped size × price, and a derived margin is
 * `notional ÷ leverage` in `DivBig` (40 places, half-up).
 *
 * @throws {PerpsError} `ValidationError` that names `amount` or `price` when
 *   it is not a positive decimal, or `leverage` when it is not a finite number
 *   above zero. `ValidationError` with the lot size when the snapped size is
 *   zero (below one lot). `SDKError` when `market.providerId` names no
 *   registered provider plugin.
 * @public
 */
export function calculateOrderAmounts(input: OrderAmountsInput): OrderAmounts {
  const { sdk, market, held, leverage } = input
  const amount = requirePositiveDecimal(input.amount, 'amount')
  const price = requirePositiveDecimal(input.price, 'price')
  if (!Number.isFinite(leverage) || leverage <= 0) {
    throw invalidInput(
      'leverage',
      `must be a finite number above zero, got ${leverage}`
    )
  }

  const requested =
    held === 'size'
      ? input.amount
      : held === 'notional'
        ? amount.div(price).toFixed()
        : amount.times(leverage).div(price).toFixed()
  const size = snapOrderSize(sdk, market, requested)
  if (isDecimalStringZero(size)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `The order size ${requested} is below the lot size ${lotSize(market)}.`
    )
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

/** @public */
export const safeCalculateOrderAmounts = createSafeFunction(
  'calculateOrderAmounts',
  calculateOrderAmounts
)
