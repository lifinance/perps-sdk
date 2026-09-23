import { PerpsError } from '@lifi/perps-sdk'
import {
  PerpsErrorCode,
  type Position,
  positionSupportsMarginAdjustment,
  positionSupportsMarginRemoval,
} from '@lifi/perps-types'
import Big from 'big.js'

const AMOUNT_DECIMALS = 6

function positionAmount(value: string, field: string): Big {
  try {
    return new Big(value)
  } catch {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid decimal string on Position.${field}: '${value}'`
    )
  }
}

function positivePositionAmount(value: string, field: string): Big {
  const amount = positionAmount(value, field)
  if (amount.lte(0)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Position.${field} must be greater than zero.`
    )
  }
  return amount
}

/**
 * Lighter removable isolated margin:
 * `allocated_margin + unrealized PnL − initial margin requirement`. Lighter
 * `allocated_margin` (`Position.marginUsed`) excludes the unrealized PnL, and
 * Lighter publishes no separate notional floor.
 *
 * @returns `undefined` for cross positions and markets without individual
 *   margin adjustment; `'0'` for add-only markets and when nothing is
 *   removable.
 * @throws {PerpsError} `ValidationError` when a required `Position` decimal
 *   is malformed or not positive.
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
  const removable = positivePositionAmount(position.marginUsed, 'marginUsed')
    .plus(positionAmount(position.unrealizedPnl, 'unrealizedPnl'))
    .minus(
      positivePositionAmount(
        position.initialMarginRequirement,
        'initialMarginRequirement'
      )
    )
  if (removable.lte(0)) {
    return '0'
  }
  return removable.round(AMOUNT_DECIMALS, Big.roundDown).toFixed()
}
