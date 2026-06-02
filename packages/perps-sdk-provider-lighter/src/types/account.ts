// Account / balance shapes returned by Lighter's `/api/v1/account` and
// `/api/v1/accountLimits` endpoints.

export type LtAccountPosition = {
  market_id: number
  symbol: string
  initial_margin_fraction: string
  open_order_count: number
  pending_order_count: number
  position_tied_order_count: number
  sign: number
  position: string
  avg_entry_price: string
  position_value: string
  unrealized_pnl: string
  realized_pnl: string
  liquidation_price: string
  total_funding_paid_out: string
  margin_mode: number
  allocated_margin: string
  total_discount: string
}

export type LtAccountAsset = {
  symbol: string
  asset_id: number
  balance: string
  locked_balance: string
}

/**
 * Account-position row from `/api/v1/account`. Identical shape to
 * `LtAccountPosition` — alias kept for read-side clarity at call sites that
 * fan out off per-market order counts (`open_order_count`,
 * `pending_order_count`, `position_tied_order_count`).
 */
export type LtDetailedAccountPosition = LtAccountPosition

export interface LtApprovedIntegrator {
  account_index: number
  name: string
  max_perps_taker_fee: number
  max_perps_maker_fee: number
  max_spot_taker_fee: number
  max_spot_maker_fee: number
  approval_expiry: number
}

export interface LtDetailedAccount {
  code: number
  account_type: number
  index: number
  l1_address: string
  cancel_all_time: number
  total_order_count: number
  total_isolated_order_count: number
  pending_order_count: number
  available_balance: string
  status: number
  collateral: string
  transaction_time: number
  account_trading_mode: number
  account_index: number
  name: string
  description: string
  positions: LtDetailedAccountPosition[]
  assets: LtAccountAsset[]
  total_asset_value: string
  cross_asset_value: string
  approved_integrators?: LtApprovedIntegrator[]
}

export interface LtDetailedAccountsResponse {
  code: number
  total: number
  accounts: LtDetailedAccount[]
}

export interface LtAccountLimits {
  code: number
  message?: string
  max_llp_percentage: number
  max_llp_amount: string
  user_tier: string
  user_tier_name?: string
  can_create_public_pool: boolean
  current_maker_fee_tick: number
  current_taker_fee_tick: number
  leased_lit: string
  effective_lit_stakes: string
}
