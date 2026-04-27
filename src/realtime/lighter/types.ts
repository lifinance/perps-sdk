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
 * Auth-channel payloads. Lighter sends raw arrays at the top level of the
 * subscribed-snapshot frame (`{type: 'subscribed/account_all_orders',
 * channel: 'account_all_orders/42', orders: [...]}`) and may also nest the
 * same arrays under `data` for `update/...` frames depending on version.
 * The provider's collector tolerates both.
 */
export type LtWsAccountAllOrdersMessage = LtWsMessage & {
  type: 'subscribed/account_all_orders' | 'update/account_all_orders'
  orders?: unknown[]
  data?: { orders?: unknown[] }
}

export type LtWsAccountAllTradesMessage = LtWsMessage & {
  type: 'subscribed/account_all_trades' | 'update/account_all_trades'
  trades?: unknown[]
  data?: { trades?: unknown[] }
}

export type LtWsAccountAllPositionsMessage = LtWsMessage & {
  type: 'subscribed/account_all_positions' | 'update/account_all_positions'
  positions?: unknown[]
  data?: { positions?: unknown[] }
}
