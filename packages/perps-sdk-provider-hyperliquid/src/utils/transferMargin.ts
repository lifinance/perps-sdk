import { PerpsError } from '@lifi/perps-sdk'
import {
  PerpsErrorCode,
  type Position,
  positionSupportsMarginAdjustment,
  positionSupportsMarginRemoval,
} from '@lifi/perps-types'
import Big from 'big.js'

const NOTIONAL_FLOOR_RATIO = '0.1'
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
 * Hyperliquid removable isolated margin:
 * `marginUsed − max(initial_margin_required, 0.1 × total_position_value)`.
 * Hyperliquid isolated `marginUsed` already includes the unrealized PnL of
 * the position, so the PnL is not added again, and it can reach zero or less
 * before liquidation.
 *
 * @returns `undefined` for cross positions and markets without individual
 *   margin adjustment; `'0'` for add-only strict-isolated markets and when
 *   nothing is removable.
 * @throws {PerpsError} `ValidationError` when a required `Position` decimal
 *   is malformed, or when a size, price or requirement is not positive.
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining
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
  const marginUsed = positionAmount(position.marginUsed, 'marginUsed')
  const initialMargin = positivePositionAmount(
    position.initialMarginRequirement,
    'initialMarginRequirement'
  )
  const notionalFloor = positivePositionAmount(position.size, 'size')
    .times(positivePositionAmount(position.markPrice, 'markPrice'))
    .times(NOTIONAL_FLOOR_RATIO)
  const minimumMargin = initialMargin.gt(notionalFloor)
    ? initialMargin
    : notionalFloor

  const removable = marginUsed.minus(minimumMargin)
  if (removable.lte(0)) {
    return '0'
  }
  return removable.round(AMOUNT_DECIMALS, Big.roundDown).toFixed()
}
