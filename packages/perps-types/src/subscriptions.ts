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
   * Significant-figures price-aggregation hint. Providers that aggregate the
   * book server-side (Hyperliquid) bucket levels to this many significant
   * figures; `undefined` requests full precision. Providers that stream the
   * full book (Lighter) ignore it.
   */
  nSigFigs?: number
  /**
   * Finer sub-bucketing within the most-significant `nSigFigs` digit. Only
   * meaningful alongside `nSigFigs`; ignored by providers that don't aggregate
   * server-side.
   */
  mantissa?: number
}
/** @public */
export type CandleSubscription = {
  channel: 'candle'
  dex: string
  marketId: string
  interval: OhlcvInterval
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
/** @public */
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
  | OrderUpdatesEvent
  | FillsEvent
  | PositionsEvent
  | SpotBalancesEvent
