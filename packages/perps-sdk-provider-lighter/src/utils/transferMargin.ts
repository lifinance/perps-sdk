import {
  type Position,
  positionSupportsMarginAdjustment,
  positionSupportsMarginRemoval,
} from '@lifi/perps-types'
import Big from 'big.js'
import { toPositiveRequiredBig, toRequiredBig } from './decimal.js'

const AMOUNT_DECIMALS = 6

/**
 * Lighter removable isolated margin:
 * `allocated_margin + unrealized PnL − initial margin requirement`. Lighter
 * `allocated_margin` (`Position.marginUsed`) excludes the unrealized PnL, and
 * Lighter publishes no separate notional floor.
 *
 * @returns `undefined` for cross positions; `'0'` when the market accepts no
 *   margin removal.
 * @see https://docs.lighter.xyz/trading/liquidations-and-llp-insurance-fund
 * @public
 */
export function positionRemovableMargin(
  position: Position
): string | undefined {
  if (!positionSupportsMarginAdjustment(position)) {
    return undefined
  }
  if (!positionSupportsMarginRemoval(position)) {
    return '0'
  }
  const removable = toPositiveRequiredBig(position.marginUsed, 'marginUsed')
    .plus(toRequiredBig(position.unrealizedPnl, 'unrealizedPnl'))
    .minus(
      toPositiveRequiredBig(
        position.initialMarginRequirement,
        'initialMarginRequirement'
      )
    )
  if (removable.lte(0)) {
    return '0'
  }
  return removable.round(AMOUNT_DECIMALS, Big.roundDown).toFixed()
}
