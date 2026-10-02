import type Big from 'big.js'
import { TruncBig } from '../decimal/big.js'

/**
 * Base size the given margin buys at `leverage`: size = margin × leverage ÷ price.
 * Truncates, so `size × price` never exceeds `margin × leverage`.
 * @public
 */
export function sizeFromMargin(margin: Big, leverage: number, price: Big): Big {
  return new TruncBig(margin).times(leverage).div(price)
}

/**
 * Margin that holds the given base size at `leverage`: margin = size × price ÷ leverage.
 * Truncates, so `margin × leverage` never exceeds `size × price`.
 * @public
 */
export function marginFromSize(size: Big, leverage: number, price: Big): Big {
  return new TruncBig(size).times(price).div(leverage)
}

/**
 * Base size for a notional: size = notional ÷ price.
 * Truncates, so `size × price` never exceeds the notional.
 * @public
 */
export function sizeFromNotional(notionalUsd: Big, price: Big): Big {
  return new TruncBig(notionalUsd).div(price)
}

/**
 * Margin for a notional at `leverage`: margin = notional ÷ leverage.
 * Truncates, so `margin × leverage` never exceeds the notional.
 * @public
 */
export function marginFromNotional(notionalUsd: Big, leverage: number): Big {
  return new TruncBig(notionalUsd).div(leverage)
}
