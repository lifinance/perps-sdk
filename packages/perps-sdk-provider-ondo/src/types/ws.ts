/**
 * Ondo WebSocket wire types. Client ops are `{op, ...args}` envelopes (only
 * `login` nests its arguments); server data frames are
 * `{type: 'update', channel, data}`.
 */

import type { OnFill, OnOrder, OnPosition } from './wire.js'

/** Level tuple as streamed: `[price, size]`, both decimal strings. @public */
export type OnBookLevel = [string, string]

/** Streamed order-book snapshot (`depthBooksPerps`/`topOfBooksPerps`). @public */
export interface OnBookSnapshot {
  market: string
  time: string
  asks: OnBookLevel[]
  bids: OnBookLevel[]
  depthLevels?: string
}

/** Streamed public trade (`tradesPerps`). @public */
export interface OnWsTrade {
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
export interface OnKline {
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
export interface OnMarkPrice {
  market: string
  markPrice: string
}

/** Streamed funding rate (`fundingRatesPerps`). @public */
export interface OnFundingRate {
  market: string
  rate: string
  intervalEnds: string
  premiums?: unknown[]
}

/** Server frame envelope. Non-`update` types are acks or errors. @public */
export type OnWsMessage =
  | { type: 'update'; channel: 'depthBooksPerps'; data: OnBookSnapshot[] }
  | { type: 'update'; channel: 'tradesPerps'; data: OnWsTrade[] }
  | { type: 'update'; channel: 'kLinePerps'; data: OnKline }
  | { type: 'update'; channel: 'markPricesPerps'; data: OnMarkPrice[] }
  | { type: 'update'; channel: 'fundingRatesPerps'; data: OnFundingRate[] }
  | { type: 'update'; channel: 'ordersPerps'; data: OnOrder[] }
  | { type: 'update'; channel: 'fillsPerps'; data: OnFill[] }
  | { type: 'update'; channel: 'positionsPerps'; data: OnPosition[] }
  | { type: 'update'; channel: string; data: unknown }
  | { type: 'pong' }
  | { type: 'loggedIn'; msg?: string }
  | { type: 'subscribed'; channel?: string }
  | { type: 'unsubscribed'; channel?: string }
  | { type: 'error'; msg?: string }
