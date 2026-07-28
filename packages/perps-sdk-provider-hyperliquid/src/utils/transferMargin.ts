import { removableIsolatedMargin } from '@lifi/perps-sdk'
import type { Position } from '@lifi/perps-types'

/** The `0.1 * total_position_value` term of Hyperliquid's requirement. */
const NOTIONAL_FLOOR_RATIO = 0.1

/**
 * Margin removable from a Hyperliquid isolated position: its equity less
 * Hyperliquid's documented
 * `transfer_margin_required = max(initial_margin_required, 0.1 * total_position_value)`,
 * with the initial-margin term at the position's own leverage. Above 10x the
 * notional floor is the binding term.
 *
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining
 * @public
 */
export function removableMargin(position: Position): string {
  return removableIsolatedMargin({
    position,
    notionalFloorRatio: NOTIONAL_FLOOR_RATIO,
  })
}
