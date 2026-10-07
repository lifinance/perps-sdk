import {
  isDecimalString,
  isDecimalStringGreaterThan,
  multiplyDecimalString,
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

const NOTIONAL_FLOOR_RATIO = '0.1'
const AMOUNT_DECIMALS = 6

function requirePositionAmount(
  value: DecimalString,
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

function requirePositivePositionAmount(
  value: DecimalString | undefined,
  field: string
): DecimalString {
  if (
    value === undefined ||
    !isDecimalStringGreaterThan(requirePositionAmount(value, field), '0')
  ) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Position.${field} must be greater than zero.`
    )
  }
  return value
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
 *   is absent or malformed, or when a size, price or requirement is not
 *   positive.
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining
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
  const marginUsed = requirePositionAmount(position.marginUsed, 'marginUsed')
  const initialMargin = requirePositivePositionAmount(
    position.initialMarginRequirement,
    'initialMarginRequirement'
  )
  const notionalFloor = multiplyDecimalString(
    multiplyDecimalString(
      requirePositivePositionAmount(position.size, 'size'),
      requirePositivePositionAmount(position.markPrice, 'markPrice')
    ),
    NOTIONAL_FLOOR_RATIO
  )
  const minimumMargin = isDecimalStringGreaterThan(initialMargin, notionalFloor)
    ? initialMargin
    : notionalFloor

  const removable = subtractDecimalString(marginUsed, minimumMargin)
  if (!isDecimalStringGreaterThan(removable, '0')) {
    return '0'
  }
  return roundDecimalString(removable, AMOUNT_DECIMALS, 'truncate')
}
