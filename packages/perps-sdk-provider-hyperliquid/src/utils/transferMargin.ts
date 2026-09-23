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

function positivePositionAmount(value: string, field: string): Big {
  let amount: Big
  try {
    amount = new Big(value)
  } catch {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid decimal string on Position.${field}: '${value}'`
    )
  }
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
 * the position, so the PnL is not added again.
 *
 * @returns `undefined` for cross positions and markets without individual
 *   margin adjustment; `'0'` for add-only strict-isolated markets.
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
  const marginUsed = positivePositionAmount(position.marginUsed, 'marginUsed')
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
