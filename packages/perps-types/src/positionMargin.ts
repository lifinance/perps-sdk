import type { Position } from './account.js'
import { MarginMode, PositionMarginAdjustment } from './enums.js'

/**
 * Whether this position can take a margin adjustment at all: it holds margin of
 * its own and its market exposes individual position margin.
 *
 * @public
 */
export function positionSupportsMarginAdjustment(position: Position): boolean {
  return (
    position.marginMode === MarginMode.ISOLATED &&
    position.market.positionMarginAdjustment !== PositionMarginAdjustment.NONE
  )
}

/**
 * Whether a removal is among the adjustments this position permits. An
 * `ADD_ONLY` market takes adds and no withdrawal.
 *
 * @public
 */
export function positionSupportsMarginRemoval(position: Position): boolean {
  return (
    positionSupportsMarginAdjustment(position) &&
    position.market.positionMarginAdjustment ===
      PositionMarginAdjustment.ADD_AND_REMOVE
  )
}
