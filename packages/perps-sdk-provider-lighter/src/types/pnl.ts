// Account PnL shapes returned by Lighter's `/api/v1/pnl` endpoint.
// Lighter serializes an empty list as JSON `null`, so list members are nullable.

import type { PnLEntry } from 'zklighter-perps/models/PnLEntry'

/**
 * One PnL bucket. `timestamp` is Unix milliseconds. Every other field is a
 * JSON number in USD for that bucket alone; the endpoint reports no account
 * value.
 *
 * @public
 */
export type LtPnLEntry = PnLEntry

/** `GET /api/v1/pnl` response envelope. @public */
export interface LtAccountPnL {
  code: number
  message?: string
  resolution: string
  pnl: LtPnLEntry[] | null
}
