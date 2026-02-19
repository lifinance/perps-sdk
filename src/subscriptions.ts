import type { Address } from './typedData.js'
import type {
  Candle,
  OhlcvInterval,
  OrderbookResponse,
  PricesResponse,
} from './market.js'
import type { HistoryItem, Position } from './account.js'
import type { Order } from './trading.js'

// --- Channels the user can subscribe to ---

export type PricesSubscription = { channel: 'prices'; dex: string }
export type OrderbookSubscription = {
  channel: 'orderbook'
  dex: string
  symbol: string
  depth?: number
}
export type TradesSubscription = {
  channel: 'trades'
  dex: string
  symbol: string
}
export type CandleSubscription = {
  channel: 'candle'
  dex: string
  symbol: string
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

export type Subscription =
  | PricesSubscription
  | OrderbookSubscription
  | TradesSubscription
  | CandleSubscription
  | OrderUpdatesSubscription
  | FillsSubscription
  | PositionsSubscription

// --- Events emitted to listeners ---

export type PricesEvent = { channel: 'prices'; data: PricesResponse }
export type OrderbookEvent = { channel: 'orderbook'; data: OrderbookResponse }
export type TradesEvent = { channel: 'trades'; data: HistoryItem[] }
export type CandleEvent = { channel: 'candle'; data: Candle }
export type OrderUpdatesEvent = { channel: 'orderUpdates'; data: Order[] }
export type FillsEvent = { channel: 'fills'; data: HistoryItem[] }
export type PositionsEvent = { channel: 'positions'; data: Position[] }

export type SubscriptionEvent =
  | PricesEvent
  | OrderbookEvent
  | TradesEvent
  | CandleEvent
  | OrderUpdatesEvent
  | FillsEvent
  | PositionsEvent
