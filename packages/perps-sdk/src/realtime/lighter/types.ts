// ---------------------------------------------------------------------------
// Lighter WebSocket message types
//
// The Lighter stream server sends JSON messages of shape:
//   { type: 'subscribed/<channel>' | 'update/<channel>' | 'ping',
//     channel: '<channel>/<id>',
//     ...payload }
//
// Channels we subscribe to:
//   - market_stats/all        → public prices across all markets
//   - order_book/{market_id}  → bids/asks per market (stateful with deltas)
// ---------------------------------------------------------------------------

export type LtWsMessage = {
  channel?: string
  type: string
}

export type LtWsPingMessage = LtWsMessage & { type: 'ping' }

export type LtWsMarketStats = {
  market_id: number
  index_price: string
  mark_price: string
  open_interest: string
  last_trade_price: string
  current_funding_rate: string
  funding_rate: string
  funding_timestamp: number
  daily_base_token_volume: string
  daily_quote_token_volume: string
  daily_price_change: string
}

/**
 * `market_stats/all` pushes one record per known market each tick. We
 * aggregate them into a Record<assetId, price> before emitting `prices`.
 */
export type LtWsMarketStatsAllMessage = LtWsMessage & {
  type: 'subscribed/market_stats' | 'update/market_stats'
  market_stats?: Record<string, LtWsMarketStats>
}

export type LtWsOrderBookLevel = {
  price: string
  size: string
}

export type LtWsOrderBook = {
  asks: LtWsOrderBookLevel[]
  bids: LtWsOrderBookLevel[]
  offset?: number
}

export type LtWsOrderBookMessage = LtWsMessage & {
  type: 'subscribed/order_book' | 'update/order_book'
  order_book: LtWsOrderBook
}

export type LtOrderBookDetail = {
  symbol: string
  market_id: number
  market_type: string
  supported_price_decimals: number
  supported_size_decimals: number
}

export type LtOrderBookDetailsResponse = {
  code: number
  order_book_details: LtOrderBookDetail[]
}

/**
 * `/api/v1/account?by=l1_address` response. The provider only consumes the
 * `index` field — everything else is intentionally typed as unknown.
 */
export type LtWsAccountByL1Response = {
  code: number
  accounts?: Array<{ index: number; [k: string]: unknown }>
}

/**
 * Auth-channel payloads.
 *
 * The response `channel` field uses `:` as separator (e.g.
 * `account_all_orders:42`) while the subscribe payload uses `/`.
 *
 * Per the Lighter WS spec:
 *   - orders/trades: object indexed by market index, each value an array
 *     (`{ "0": [Order], "1": [Order] }`)
 *   - positions: object indexed by market index, each value a single object
 *     (`{ "0": Position }`)
 *   - initial `account_all_trades` snapshot may send an empty flat array
 *
 * The provider uses `collectAuthChannelItems` to normalise all three shapes
 * into a flat T[].
 */
export type LtWsAccountAllOrdersMessage = LtWsMessage & {
  type: 'subscribed/account_all_orders' | 'update/account_all_orders'
  orders?: Record<string, unknown[]> | unknown[]
  data?: { orders?: Record<string, unknown[]> | unknown[] }
}

export type LtWsAccountAllTradesMessage = LtWsMessage & {
  type: 'subscribed/account_all_trades' | 'update/account_all_trades'
  trades?: Record<string, unknown[]> | unknown[]
  total_volume?: number
  monthly_volume?: number
  weekly_volume?: number
  daily_volume?: number
  data?: { trades?: Record<string, unknown[]> | unknown[] }
}

export type LtWsAccountAllPositionsMessage = LtWsMessage & {
  type: 'subscribed/account_all_positions' | 'update/account_all_positions'
  positions?: Record<string, unknown>
  shares?: unknown[]
  last_funding_round?: Record<string, string>
  last_funding_discount?: Record<string, string>
  data?: { positions?: Record<string, unknown> }
}
