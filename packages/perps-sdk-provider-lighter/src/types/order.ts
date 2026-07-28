// Order shapes returned by Lighter's REST API.

/**
 * Order payload returned by Lighter's REST API. Amounts and prices are decimal
 * strings in market precision. `order_expiry` is an absolute Unix-millisecond
 * expiry; `created_at`, `updated_at`, and `transaction_time` are Unix seconds.
 * Enum-like side, type, time-in-force, status, and trigger fields retain
 * Lighter's wire strings.
 *
 * @public
 */
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
  parent_order_index: number
  parent_order_id: string
  to_trigger_order_id_0: string
  to_trigger_order_id_1: string
  to_cancel_order_id_0: string
  block_height: number
  timestamp: number
  created_at: number
  updated_at: number
  transaction_time: number
}

/**
 * Paginated order-history response from Lighter. `next_cursor` is an opaque
 * continuation value for the next page.
 *
 * @public
 */
export interface LtOrdersResponse {
  code: number
  next_cursor: string
  orders: LtOrder[]
}

/**
 * Single order-book level returned by Lighter. Amounts and prices are decimal
 * strings in the market's native precision; expiry and transaction time are
 * Unix milliseconds.
 *
 * @public
 */
export interface LtOrderBookOrder {
  order_index: number
  order_id: string
  owner_account_index: number
  initial_base_amount: string
  remaining_base_amount: string
  price: string
  order_expiry: number
  transaction_time: number
}

/**
 * Order-book response containing separate ask and bid levels plus their counts.
 *
 * @public
 */
export interface LtOrderBookOrdersResponse {
  code: number
  total_asks: number
  asks: LtOrderBookOrder[]
  total_bids: number
  bids: LtOrderBookOrder[]
}
