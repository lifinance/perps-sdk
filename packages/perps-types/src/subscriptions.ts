import type { Fill, Position } from './account.js'
import type { Order } from './action.js'
import type { Candle, OhlcvInterval, OrderbookResponse } from './asset.js'
import type { Address } from './typedData.js'

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
export type OrderUpdatesEvent = { channel: 'orderUpdates'; data: Order[] }
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
