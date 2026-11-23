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
import {
  BASIS_POINTS_PER_UNIT,
  validateInitialMarginFractionBps,
} from '../math/leverage.js'
import type { PerpsSDKClient } from '../types/provider.js'
import { createSafeFunction } from '../utils/createSafeFunction.js'
import { snapOrderSize } from './snap.js'

/** @public */
export interface OrderAmountsInputBase {
  sdk: PerpsSDKClient
  market: Market
  /** The field the user typed; the other two are calculated from it. */
  held: 'margin' | 'size' | 'notional'
  amount: DecimalString
  /** The leverage multiple. Not read when `initialMarginFractionBps` is present. */
  leverage?: number
  /**
   * The venue's native integer IMF in basis points (`'700'` is 7.00%), the
   * exact margin rate of a venue that stores one. Pass the reported
   * `MarketSettings.initialMarginFractionBps`; `leverage` then stays unread.
   */
  initialMarginFractionBps?: DecimalString
  price: DecimalString
}

/**
 * The order-entry input with at least one margin-rate source: the leverage
 * multiple, the native IMF, or both.
 *
 * @public
 */
export type OrderAmountsInput = OrderAmountsInputBase &
  ({ leverage: number } | { initialMarginFractionBps: DecimalString })

/** @public */
export interface OrderAmounts {
  /**
   * The held `amount`, byte-identical, when the user holds the margin;
   * otherwise `notional ÷ leverage` or `notional × IMF ÷ 10000`, a display
   * and comparison value that never reaches a venue.
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
 * The margin rate as `[numerator, denominator]`, so each amount divides one
 * time: the native IMF over its scale, else one over the leverage.
 *
 * @throws {PerpsError} `ValidationError` as {@link calculateOrderAmounts}.
 */
function resolveMarginRate(
  input: OrderAmountsInput
): [Big | number, Big | number] {
  if (input.initialMarginFractionBps !== undefined) {
    return [
      new TruncBig(
        validateInitialMarginFractionBps(input.initialMarginFractionBps)
      ),
      new TruncBig(BASIS_POINTS_PER_UNIT),
    ]
  }
  const { leverage } = input
  if (
    typeof leverage !== 'number' ||
    !Number.isFinite(leverage) ||
    leverage <= 0
  ) {
    throw invalidInput(
      'leverage',
      `must be a finite number above zero, got ${leverage}`
    )
  }
  return [1, leverage]
}

/**
 * The three order-entry amounts, derived from whichever one the user typed.
 * Only `size` snaps, onto the market's venue lot grid, because an order sends
 * size alone; no quote amount has a grid. A held margin returns byte-identical,
 * `notional` is the snapped size × price, and a derived margin is
 * `notional ÷ leverage`, or `notional × initialMarginFractionBps ÷ 10000`
 * from a native IMF, in `DivBig` (40 places, half-up).
 *
 * @throws {PerpsError} `ValidationError` that names `amount` or `price` when
 *   it is not a positive decimal, `initialMarginFractionBps` when it is
 *   present and not a positive integer, or `leverage` when no IMF is present
 *   and it is not a finite number above zero. `ValidationError` with the lot
 *   size when the snapped size is zero (below one lot). `SDKError` when
 *   `market.providerId` names no registered provider plugin.
 * @public
 */
export function calculateOrderAmounts(input: OrderAmountsInput): OrderAmounts {
  const { sdk, market, held } = input
  const amount = requirePositiveDecimal(input.amount, 'amount')
  const price = requirePositiveDecimal(input.price, 'price')
  const [rateNumerator, rateDenominator] = resolveMarginRate(input)

  const requested =
    held === 'size'
      ? input.amount
      : held === 'notional'
        ? amount.div(price).toFixed()
        : amount
            .times(rateDenominator)
            .div(price.times(rateNumerator))
            .toFixed()
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
        : new DivBig(notional)
            .times(rateNumerator)
            .div(rateDenominator)
            .toFixed(),
    size,
    notional: notional.toFixed(),
  }
}

/** @public */
export const safeCalculateOrderAmounts = createSafeFunction(
  'calculateOrderAmounts',
  calculateOrderAmounts
)
