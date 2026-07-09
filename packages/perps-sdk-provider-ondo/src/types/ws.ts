/**
 * Ondo WebSocket wire types. Client ops are `{op, ...args}` envelopes (only
 * `login` nests its arguments); server data frames are
 * `{type: 'update', channel, data}`.
 */

import type { OndoFill, OndoOrder, OndoPosition } from './wire.js'

/** Level tuple as streamed: `[price, size]`, both decimal strings. @public */
export type OndoBookLevel = [string, string]

/** Streamed order-book snapshot (`depthBooksPerps`/`topOfBooksPerps`). @public */
export interface OndoBookSnapshot {
  market: string
  time: string
  asks: OndoBookLevel[]
  bids: OndoBookLevel[]
  depthLevels?: string
}

/** Streamed public trade (`tradesPerps`). @public */
export interface OndoWsTrade {
  market: string
  price: string
  size: string
  cost: string
  aggressor_side: 'buy' | 'sell'
  time: string
  id: string
}

/**
 * Streamed candlestick (`kLinePerps`). Prices and volume arrive as numbers,
 * unlike the string-typed REST shapes; `s`/`e`/`t` are Unix seconds.
 * @public
 */
export interface OndoKline {
  m: string
  t: number
  s: number
  e: number
  o: number
  h: number
  l: number
  c: number
  v: number
  x: boolean
}

/** Streamed mark price (`markPricesPerps`). @public */
export interface OndoMarkPrice {
  market: string
  markPrice: string
}

/** Streamed funding rate (`fundingRatesPerps`). @public */
export interface OndoFundingRate {
  market: string
  rate: string
  intervalEnds: string
  premiums?: unknown[]
}

/** Server frame envelope. Non-`update` types are acks or errors. @public */
export type OndoWsMessage =
  | { type: 'update'; channel: 'depthBooksPerps'; data: OndoBookSnapshot[] }
  | { type: 'update'; channel: 'tradesPerps'; data: OndoWsTrade[] }
  | { type: 'update'; channel: 'kLinePerps'; data: OndoKline }
  | { type: 'update'; channel: 'markPricesPerps'; data: OndoMarkPrice[] }
  | { type: 'update'; channel: 'fundingRatesPerps'; data: OndoFundingRate[] }
  | { type: 'update'; channel: 'ordersPerps'; data: OndoOrder[] }
  | { type: 'update'; channel: 'fillsPerps'; data: OndoFill[] }
  | { type: 'update'; channel: 'positionsPerps'; data: OndoPosition[] }
  | { type: 'update'; channel: string; data: unknown }
  | { type: 'pong' }
  | { type: 'loggedIn'; msg?: string }
  | { type: 'subscribed'; channel?: string }
  | { type: 'unsubscribed'; channel?: string }
  | { type: 'error'; msg?: string }
