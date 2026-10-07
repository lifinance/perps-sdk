import {
  addDecimalString,
  isDecimalString,
  isDecimalStringGreaterThan,
  PerpsError,
  positionSupportsMarginAdjustment,
  positionSupportsMarginRemoval,
  roundDecimalString,
  subtractDecimalString,
} from '@lifi/perps-sdk'
import {
  type DecimalString,
  PerpsErrorCode,
  type Position,
} from '@lifi/perps-types'

const AMOUNT_DECIMALS = 6

function positionAmount(
  value: DecimalString | undefined,
  field: string
): DecimalString {
  if (!isDecimalString(value)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid \`Position.${field}\`: '${value}' is not a decimal string.`
    )
  }
  return value
}

function positivePositionAmount(
  value: DecimalString | undefined,
  field: string
): DecimalString {
  const amount = positionAmount(value, field)
  if (!isDecimalStringGreaterThan(amount, '0')) {
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
): DecimalString | undefined {
  if (!positionSupportsMarginAdjustment(position)) {
    return undefined
  }
  if (!positionSupportsMarginRemoval(position)) {
    return '0'
  }
  const removable = subtractDecimalString(
    addDecimalString(
      positivePositionAmount(position.marginUsed, 'marginUsed'),
      positionAmount(position.unrealizedPnl, 'unrealizedPnl')
    ),
    positivePositionAmount(
      position.initialMarginRequirement,
      'initialMarginRequirement'
    )
  )
  if (!isDecimalStringGreaterThan(removable, '0')) {
    return '0'
  }
  return roundDecimalString(removable, AMOUNT_DECIMALS, 'truncate')
}
