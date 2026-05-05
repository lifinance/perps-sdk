// ---------------------------------------------------------------------------
// Lighter raw API response types — shared between backend (REST) and SDK (WS)
// ---------------------------------------------------------------------------

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

export type LtTrade = {
  trade_id: number
  tx_hash: string
  type: string
  market_id: number
  size: string
  price: string
  usd_amount: string
  ask_id: number
  bid_id: number
  ask_account_id: number
  bid_account_id: number
  is_maker_ask: boolean
  block_height: number
  timestamp: number
  // Lighter's OpenAPI spec marks these as required `StrictInt`, but the live
  // /api/v1/trades endpoint omits them on some `type: "trade"` rows (observed
  // on older trades). Treat as optional and let the mapper produce `undefined`
  // for Fill.fee (already optional) when missing.
  taker_fee?: number
  maker_fee?: number
  transaction_time: number
}

export type LtOrder = {
  order_index: number
  client_order_index: number
  order_id: string
  client_order_id: string
  market_index: number
  owner_account_index: number
  initial_base_amount: string
  price: string
  nonce: number
  remaining_base_amount: string
  is_ask: boolean
  filled_base_amount: string
  filled_quote_amount: string
  side: string
  type: string
  time_in_force: string
  reduce_only: boolean
  trigger_price: string
  order_expiry: number
  status: string
  trigger_status: string
  trigger_time: number
  block_height: number
  timestamp: number
  created_at: number
  updated_at: number
  transaction_time: number
}
