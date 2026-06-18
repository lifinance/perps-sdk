import type {
  Balance,
  Fill,
  OpenOrder,
  Position,
  TriggerOrder,
} from './account.js'
import type { Candle, OhlcvInterval, OrderbookResponse } from './market.js'
import type { Address } from './primitives.js'

/** @public */
export type PricesSubscription = { channel: 'prices'; dex: string }
/** @public */
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
/** @public */
export type CandleSubscription = {
  channel: 'candle'
  dex: string
  marketId: string
  interval: OhlcvInterval
}
/**
 * Per-market live context for one viewed market, page-scoped like
 * {@link OrderbookSubscription} and {@link CandleSubscription}. Each venue
 * sources it from its own per-market wire channel (HL `activeAssetCtx`,
 * Lighter `market_stats/{id}`), so it is keyed by `marketId` rather than
 * riding the market-agnostic {@link PricesSubscription}.
 * @public
 */
export type MarketContextSubscription = {
  channel: 'marketContext'
  dex: string
  marketId: string
}
/** @public */
export type OrderUpdatesSubscription = {
  channel: 'orderUpdates'
  dex: string
  address: Address
}
/** @public */
export type FillsSubscription = {
  channel: 'fills'
  dex: string
  address: Address
}
/** @public */
export type PositionsSubscription = {
  channel: 'positions'
  dex: string
  address: Address
}
/** @public */
export type SpotBalancesSubscription = {
  channel: 'spotBalances'
  dex: string
  address: Address
}

/** @public */
export type Subscription =
  | PricesSubscription
  | OrderbookSubscription
  | CandleSubscription
  | MarketContextSubscription
  | OrderUpdatesSubscription
  | FillsSubscription
  | PositionsSubscription
  | SpotBalancesSubscription

/** @public */
export type PricesEvent = { channel: 'prices'; data: Record<string, string> }
/** @public */
export type OrderbookEvent = { channel: 'orderbook'; data: OrderbookResponse }
/** @public */
export type CandleEvent = { channel: 'candle'; data: Candle }
/**
 * Per-market context payload. `oraclePrice` is the venue oracle price; absent
 * until the venue first streams one for the market.
 * @public
 */
export type MarketContext = { oraclePrice?: string }
/** @public */
export type MarketContextEvent = {
  channel: 'marketContext'
  marketId: string
  data: MarketContext
}
/** @public */
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
/** @public */
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

/** @public */
export type SubscriptionEvent =
  | PricesEvent
  | OrderbookEvent
  | CandleEvent
  | MarketContextEvent
  | OrderUpdatesEvent
  | FillsEvent
  | PositionsEvent
  | SpotBalancesEvent
