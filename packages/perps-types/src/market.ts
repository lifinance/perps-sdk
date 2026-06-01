import type { Asset } from './asset.js'

export interface FundingInfo {
  rate: string
  nextFundingTime: number
}

export interface BaseMarket {
  providerId: string
  /** Opaque provider market id; referenced elsewhere as `marketId`. */
  id: string
  /** References a {@link ProviderCategory} by id. */
  categoryId: string
  baseAsset: Asset
  quoteAsset: Asset
  szDecimals: number
  markPrice: string
  volume24h?: string
  prevDayPrice?: string
}

export interface PerpsMarket extends BaseMarket {
  maxLeverage: number
  onlyIsolated: boolean
  funding: FundingInfo
  openInterest?: string
}

export interface SpotMarket extends BaseMarket {}

export type Market = PerpsMarket | SpotMarket

export type MarketDisplay = Pick<
  BaseMarket,
  'providerId' | 'id' | 'categoryId' | 'baseAsset' | 'quoteAsset'
>

/**
 * Minimal market reference for write-action params: identifies a market by
 * its opaque `marketId` within a `categoryId`. Embeds no Assets — write
 * params reference by id, not value.
 */
export interface MarketRef {
  marketId: string
  categoryId: string
}

export interface MarketsResponse {
  markets: Market[]
}

export interface MarketPrice {
  marketId: string
  price: string
}

export interface PricesResponse {
  prices: MarketPrice[]
}

export interface Candle {
  t: number
  o: string
  h: string
  l: string
  c: string
  v: string
}

export interface OhlcvResponse {
  provider: string
  marketId: string
  interval: string
  candles: Candle[]
}

export type OhlcvInterval =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '8h'
  | '12h'
  | '1d'
  | '3d'
  | '1w'
  | '1M'

export interface OrderbookLevel {
  price: string
  size: string
}

export interface OrderbookResponse {
  provider: string
  marketId: string
  bids: OrderbookLevel[]
  asks: OrderbookLevel[]
  timestamp: number
}
