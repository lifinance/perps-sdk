// The Lighter stream server sends JSON messages of shape:
//   { type: 'subscribed/<channel>' | 'update/<channel>' | 'ping',
//     channel: '<channel>/<id>',
//     ...payload }
//
// Channels we subscribe to:
//   - market_stats/all        → public prices across all perp markets
//   - spot_market_stats/all   → public prices across all spot markets
//   - order_book/{market_id}  → bids/asks per market (stateful with deltas)

/** @public */
export type LtWsMessage = {
  channel?: string
  type: string
}

/** @public */
export type LtWsPingMessage = LtWsMessage & { type: 'ping' }

/** @public */
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
 * @public
 */
export type LtWsMarketStatsAllMessage = LtWsMessage & {
  type: 'subscribed/market_stats' | 'update/market_stats'
  market_stats?: Record<string, LtWsMarketStats>
}

/**
 * Per-market `market_stats/{MARKET_INDEX}` push. Unlike `market_stats/all`
 * (a Record), the per-market `market_stats` field is a single object — branch
 * on the response `channel` suffix (`:{id}` vs `:all`) to parse correctly.
 * @public
 */
export type LtWsMarketStatsMessage = LtWsMessage & {
  type: 'subscribed/market_stats' | 'update/market_stats'
  market_stats?: LtWsMarketStats
}

/**
 * Spot market stats carry no funding/open-interest fields and address
 * markets by their spot `market_id` (2048+).
 * @public
 */
export type LtWsSpotMarketStats = {
  market_id: number
  symbol: string
  index_price: string
  mid_price: string
  best_ask_price: string
  best_bid_price: string
  last_trade_price: string
  daily_base_token_volume: number
  daily_quote_token_volume: number
  daily_price_low: number
  daily_price_high: number
  daily_price_change: number
}

/**
 * `spot_market_stats/all` is the spot-market counterpart to
 * `market_stats/all`; both feed the same aggregated `prices` emit.
 * @public
 */
export type LtWsSpotMarketStatsAllMessage = LtWsMessage & {
  type: 'subscribed/spot_market_stats' | 'update/spot_market_stats'
  spot_market_stats?: Record<string, LtWsSpotMarketStats>
}

/**
 * Per-market `spot_market_stats/{MARKET_INDEX}` push — single object, the
 * spot counterpart to {@link LtWsMarketStatsMessage}.
 * @public
 */
export type LtWsSpotMarketStatsMessage = LtWsMessage & {
  type: 'subscribed/spot_market_stats' | 'update/spot_market_stats'
  spot_market_stats?: LtWsSpotMarketStats
}

/** @public */
export type LtWsOrderBookLevel = {
  price: string
  size: string
}

/** @public */
export type LtWsOrderBook = {
  asks: LtWsOrderBookLevel[]
  bids: LtWsOrderBookLevel[]
  offset?: number
}

/** @public */
export type LtWsOrderBookMessage = LtWsMessage & {
  type: 'subscribed/order_book' | 'update/order_book'
  order_book: LtWsOrderBook
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
 * @public
 */
export type LtWsAccountAllOrdersMessage = LtWsMessage & {
  type: 'subscribed/account_all_orders' | 'update/account_all_orders'
  orders?: Record<string, unknown[]> | unknown[]
  data?: { orders?: Record<string, unknown[]> | unknown[] }
}

/** @public */
export type LtWsAccountAllTradesMessage = LtWsMessage & {
  type: 'subscribed/account_all_trades' | 'update/account_all_trades'
  trades?: Record<string, unknown[]> | unknown[]
  total_volume?: number
  monthly_volume?: number
  weekly_volume?: number
  daily_volume?: number
  data?: { trades?: Record<string, unknown[]> | unknown[] }
}

/** @public */
export type LtWsAccountAllPositionsMessage = LtWsMessage & {
  type: 'subscribed/account_all_positions' | 'update/account_all_positions'
  positions?: Record<string, unknown>
  shares?: unknown[]
  last_funding_round?: Record<string, string>
  last_funding_discount?: Record<string, string>
  data?: { positions?: Record<string, unknown> }
}
