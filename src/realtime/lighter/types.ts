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
