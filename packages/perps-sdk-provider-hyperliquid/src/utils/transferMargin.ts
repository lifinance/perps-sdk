import { PerpsError } from '@lifi/perps-sdk'
import {
  MarginMode,
  PerpsErrorCode,
  type Position,
  PositionMarginAdjustment,
  type PositionMarginConstraints,
} from '@lifi/perps-types'
import Big from 'big.js'

const NOTIONAL_FLOOR_RATIO = '0.1'
const AMOUNT_INCREMENT = '0.000001'

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
 * Hyperliquid's exact documented transfer-margin requirement:
 * `max(initial_margin_required, 0.1 * total_position_value)`.
 *
 * Strict-isolated markets still return constraints because margin can be
 * added; their market capability prevents removal. Cross positions and
 * markets without individual margin adjustment return `undefined`.
 *
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining
 * @public
 */
export function positionMarginConstraints(
  position: Position
): PositionMarginConstraints | undefined {
  if (
    position.marginMode !== MarginMode.ISOLATED ||
    position.market.positionMarginAdjustment === PositionMarginAdjustment.NONE
  ) {
    return undefined
  }
  const initialMargin = positivePositionAmount(
    position.initialMarginRequirement,
    'initialMarginRequirement'
  )
  const notional = positivePositionAmount(position.size, 'size').times(
    positivePositionAmount(position.markPrice, 'markPrice')
  )
  const notionalFloor = notional.times(NOTIONAL_FLOOR_RATIO)
  const minimumMargin = initialMargin.gt(notionalFloor)
    ? initialMargin
    : notionalFloor

  return {
    minimumMarginRequirement: minimumMargin.toFixed(),
    amountIncrement: AMOUNT_INCREMENT,
  }
}
