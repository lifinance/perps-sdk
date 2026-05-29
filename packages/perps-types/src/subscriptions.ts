import type { Fill, OpenOrder, Position, TriggerOrder } from './account.js'
import type { Candle, OhlcvInterval, OrderbookResponse } from './asset.js'
import type { Address } from './primitives.js'

// --- Channels the user can subscribe to ---

export type PricesSubscription = { channel: 'prices'; dex: string }
export type OrderbookSubscription = {
  channel: 'orderbook'
  dex: string
  assetId: string
  depth?: number
}
export type CandleSubscription = {
  channel: 'candle'
  dex: string
  assetId: string
  interval: OhlcvInterval
}
export type OrderUpdatesSubscription = {
  channel: 'orderUpdates'
  dex: string
  address: Address
}
export type FillsSubscription = {
  channel: 'fills'
  dex: string
  address: Address
}
export type PositionsSubscription = {
  channel: 'positions'
  dex: string
  address: Address
}
export type SpotBalancesSubscription = {
  channel: 'spotBalances'
  dex: string
  address: Address
}

export type Subscription =
  | PricesSubscription
  | OrderbookSubscription
  | CandleSubscription
  | OrderUpdatesSubscription
  | FillsSubscription
  | PositionsSubscription
  | SpotBalancesSubscription

// --- Events emitted to listeners ---

export interface SpotBalance {
  coin: string
  total: string
  hold: string
}

export type PricesEvent = { channel: 'prices'; data: Record<string, string> }
export type OrderbookEvent = { channel: 'orderbook'; data: OrderbookResponse }
export type CandleEvent = { channel: 'candle'; data: Candle }
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
export type FillsEvent = { channel: 'fills'; data: Fill[] }
export type PositionsEvent = { channel: 'positions'; data: Position[] }
export type SpotBalancesEvent = { channel: 'spotBalances'; data: SpotBalance[] }

export type SubscriptionEvent =
  | PricesEvent
  | OrderbookEvent
  | CandleEvent
  | OrderUpdatesEvent
  | FillsEvent
  | PositionsEvent
  | SpotBalancesEvent
