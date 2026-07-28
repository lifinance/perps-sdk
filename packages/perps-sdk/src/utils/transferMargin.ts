import {
  PerpsErrorCode,
  type Position,
  type PositionMarginConstraints,
  positionSupportsMarginRemoval,
} from '@lifi/perps-types'
import Big from 'big.js'
import { PerpsError } from '../errors/PerpsError.js'

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

function constraintAmount(value: string, field: string): Big {
  try {
    return new Big(value)
  } catch {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid decimal string on PositionMarginConstraints.${field}: '${value}'`
    )
  }
}

function requirePositive(value: Big, field: string): Big {
  if (value.lte(0)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `${field} must be greater than zero.`
    )
  }
  return value
}

/**
 * Exact inputs for {@link removableIsolatedMargin}.
 *
 * @public
 */
export interface RemovableIsolatedMarginParams {
  position: Position
  constraints: PositionMarginConstraints
}

/**
 * Calculate margin that can be removed from an isolated position using the
 * provider's exact retained-margin requirement. Position equity is allocated
 * margin plus unrealized PnL.
 *
 * The result snaps down to the provider's accepted amount increment. Markets
 * that are add-only and cross-margined positions return `'0'`.
 *
 * @throws {PerpsError} `ValidationError` for malformed, non-positive, or
 *   inconsistent risk inputs.
 * @public
 */
export function removableIsolatedMargin({
  position,
  constraints,
}: RemovableIsolatedMarginParams): string {
  if (!positionSupportsMarginRemoval(position)) {
    return '0'
  }

  const marginUsed = requirePositive(
    positionAmount(position.marginUsed, 'marginUsed'),
    'Position.marginUsed'
  )
  const unrealizedPnl = positionAmount(position.unrealizedPnl, 'unrealizedPnl')
  const minimumMargin = requirePositive(
    constraintAmount(
      constraints.minimumMarginRequirement,
      'minimumMarginRequirement'
    ),
    'PositionMarginConstraints.minimumMarginRequirement'
  )
  const amountIncrement = requirePositive(
    constraintAmount(constraints.amountIncrement, 'amountIncrement'),
    'PositionMarginConstraints.amountIncrement'
  )

  const removable = marginUsed.plus(unrealizedPnl).minus(minimumMargin)
  if (removable.lte(0)) {
    return '0'
  }
  return removable
    .div(amountIncrement)
    .round(0, Big.roundDown)
    .times(amountIncrement)
    .toFixed()
}
