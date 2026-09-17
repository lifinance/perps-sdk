// Account PnL shapes returned by Lighter's `/api/v1/pnl` endpoint.
// Lighter serializes an empty list as JSON `null`, so list members are nullable.

/**
 * One PnL bucket. `timestamp` is Unix milliseconds. Every other field is a
 * JSON number in USD for that bucket alone; the endpoint reports no account
 * value.
 *
 * @public
 */
export interface LtPnLEntry {
  timestamp: number
  trade_pnl: number
  inflow: number
  outflow: number
  pool_pnl: number
  pool_inflow: number
  pool_outflow: number
  pool_total_shares: number
  spot_inflow: number
  spot_outflow: number
  staked_lit: number
  staking_inflow: number
  staking_outflow: number
  staking_pnl: number
  trade_spot_pnl: number
  volume: number
}

/** `GET /api/v1/pnl` response envelope. @public */
export interface LtAccountPnL {
  code: number
  message?: string
  resolution: string
  pnl: LtPnLEntry[] | null
}
