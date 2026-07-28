import { PerpsErrorCode, type Position } from '@lifi/perps-types'
import Big from 'big.js'
import { PerpsError } from '../errors/PerpsError.js'

/** Finer than any venue's collateral precision (USDC carries 6 decimals). */
const MARGIN_DP = 8

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

/**
 * Terms of a venue's transfer-margin requirement — see
 * {@link removableIsolatedMargin}.
 *
 * @public
 */
export interface RemovableIsolatedMarginParams {
  position: Position
  /**
   * Floor on the retained margin as a fraction of the position's notional,
   * applied on top of the initial-margin requirement (Hyperliquid publishes
   * `0.1`). Omit for a venue whose requirement is the initial margin alone.
   */
  notionalFloorRatio?: number
}

/**
 * Margin removable from an isolated position under a venue's transfer-margin
 * requirement: the position's equity (`Position.marginUsed`, unrealized PnL
 * already included) less
 * `max(notional / Position.leverage, notionalFloorRatio * notional)`.
 *
 * The initial-margin term binds at the position's own leverage, not the
 * market's `maxLeverage`: a position opened below the market cap has to keep
 * the margin its own leverage implies. Conservative by construction — the
 * requirement rounds up and the result rounds down, so the figure can only
 * under-report what the venue accepts.
 *
 * @returns Removable margin as a decimal string, never negative; `'0'` when
 *   `Position.leverage` is not positive, leaving the initial-margin term
 *   unevaluable.
 * @throws {PerpsError} `ValidationError` when `size`, `markPrice` or
 *   `marginUsed` is not a decimal string.
 * @public
 */
export function removableIsolatedMargin(
  params: RemovableIsolatedMarginParams
): string {
  const { position, notionalFloorRatio } = params
  if (position.leverage <= 0) {
    return '0'
  }
  const notional = positionAmount(position.size, 'size')
    .abs()
    .times(positionAmount(position.markPrice, 'markPrice'))
  const initialMargin = notional.div(position.leverage)
  const notionalFloor =
    notionalFloorRatio === undefined
      ? new Big(0)
      : notional.times(notionalFloorRatio)
  const required = (
    initialMargin.gt(notionalFloor) ? initialMargin : notionalFloor
  ).round(MARGIN_DP, Big.roundUp)
  const removable = positionAmount(position.marginUsed, 'marginUsed')
    .minus(required)
    .round(MARGIN_DP, Big.roundDown)
  return removable.gt(0) ? removable.toFixed() : '0'
}
