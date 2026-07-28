import type {
  AccountSummary,
  Balance,
  Fill,
  OpenOrder,
  Position,
  TriggerOrder,
} from './account.js'
import type {
  Candle,
  MarketContext,
  OhlcvInterval,
  OrderbookResponse,
  Trade,
} from './market.js'
import type { Address } from './primitives.js'

/** Subscription for the provider's aggregate market-context stream. @public */
export type MarketsContextSubscription = {
  channel: 'marketsContext'
  dex: string
}
/** Subscription for one market's live context stream. @public */
export type MarketContextSubscription = {
  channel: 'marketContext'
  dex: string
  marketId: string
}
/** Subscription for streamed order-book updates for one market. @public */
export type OrderbookSubscription = {
  channel: 'orderbook'
  dex: string
  marketId: string
  depth?: number
  /**
   * Desired price granularity of streamed levels, in quote currency (e.g.
   * `10` buckets a BTC book into $10-wide levels). Providers that aggregate
   * the book server-side honour it best-effort; providers that stream the
   * full book ignore it. `undefined` requests full precision.
   */
  priceStep?: number
}
/** Subscription for OHLCV candle updates for one market and interval. @public */
export type CandleSubscription = {
  channel: 'candle'
  dex: string
  marketId: string
  interval: OhlcvInterval
}
/** Subscription for recent trade updates for one market. @public */
export type TradesSubscription = {
  channel: 'trades'
  dex: string
  marketId: string
}
/** Subscription for order lifecycle updates for one account. @public */
export type OrderUpdatesSubscription = {
  channel: 'orderUpdates'
  dex: string
  address: Address
}
/** Subscription for execution/fill updates for one account. @public */
export type FillsSubscription = {
  channel: 'fills'
  dex: string
  address: Address
}
/** Subscription for the full open-position set for one account. @public */
export type PositionsSubscription = {
  channel: 'positions'
  dex: string
  address: Address
}
/** Subscription for spot-balance updates for one account. @public */
export type SpotBalancesSubscription = {
  channel: 'spotBalances'
  dex: string
  address: Address
}
/** Subscription for aggregate account-summary updates for one account. @public */
export type AccountSummarySubscription = {
  channel: 'accountSummary'
  dex: string
  address: Address
}

/**
 * Union of all websocket subscription request shapes.
 *
 * @public
 */
export type Subscription =
  | MarketsContextSubscription
  | MarketContextSubscription
  | OrderbookSubscription
  | CandleSubscription
  | TradesSubscription
  | OrderUpdatesSubscription
  | FillsSubscription
  | PositionsSubscription
  | SpotBalancesSubscription
  | AccountSummarySubscription

/** Event containing the provider's aggregate market contexts. @public */
export type MarketsContextEvent = {
  channel: 'marketsContext'
  data: Record<string, MarketContext>
}
/** Event containing one market's live context. @public */
export type MarketContextEvent = {
  channel: 'marketContext'
  data: MarketContext
}
/** Event containing an order-book snapshot or update. @public */
export type OrderbookEvent = { channel: 'orderbook'; data: OrderbookResponse }
/** Event containing one OHLCV candle. @public */
export type CandleEvent = { channel: 'candle'; data: Candle }
/** Event containing recent trades. @public */
export type TradesEvent = { channel: 'trades'; data: Trade[] }
/** Event containing order upserts and terminal order ids. @public */
export type OrderUpdatesEvent = {
  channel: 'orderUpdates'
  data: {
    /** Upserts — active orders, non-trigger. */
    openOrders: OpenOrder[]
    /** Upserts — active orders with trigger semantics (TP/SL). */
    triggerOrders: TriggerOrder[]
    /**
     * orderIds whose status just transitioned to terminal (filled, cancelled,
     * rejected, expired). Consumers should evict these from both buckets.
     */
    terminated: string[]
  }
}
/** Event containing newly observed executions/fills. @public */
export type FillsEvent = { channel: 'fills'; data: Fill[] }
/**
 * Positions stream frame. `data` is always the full set of currently open
 * positions for the subscribed address, never a partial update: zero-size
 * entries never appear, and a close is observed as the market's absence from
 * the next frame. Consumers replace their state; they must not merge.
 * @public
 */
export type PositionsEvent = { channel: 'positions'; data: Position[] }
/**
 * Spot holdings as typed {@link Balance}s, each carrying the venue-locked
 * portion (`locked` = reserved against open orders; `available = units − locked`).
 * @public
 */
export type SpotBalancesEvent = {
  channel: 'spotBalances'
  data: (Balance & { locked: string })[]
}

/**
 * Venue-computed account roll-up frame. Field coverage matches the venue's
 * own stream; Hyperliquid's `portfolioValue` covers perps equity only (spot
 * balances have their own stream).
 * @public
 */
export type AccountSummaryEvent = {
  channel: 'accountSummary'
  data: AccountSummary
}

/**
 * Union of all websocket event frame shapes emitted for subscriptions.
 *
 * @public
 */
export type SubscriptionEvent =
  | MarketsContextEvent
  | MarketContextEvent
  | OrderbookEvent
  | CandleEvent
  | TradesEvent
  | OrderUpdatesEvent
  | FillsEvent
  | PositionsEvent
  | SpotBalancesEvent
  | AccountSummaryEvent
