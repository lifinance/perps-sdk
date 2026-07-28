import { removableIsolatedMargin } from '@lifi/perps-sdk'
import type { Position } from '@lifi/perps-types'

/**
 * Margin removable from a Lighter isolated position: its allocated margin less
 * the initial margin required at the position's own leverage. Lighter gates
 * `update_margin` on the account-health invariant `Account Value >= Initial
 * Margin Req`; neither its docs nor its published business-error table name a
 * further notional-percentage floor, so there is no floor term here.
 *
 * @see https://docs.lighter.xyz/trading/liquidations-and-llp-insurance-fund
 * @public
 */
export function removableMargin(position: Position): string {
  return removableIsolatedMargin({ position })
}
