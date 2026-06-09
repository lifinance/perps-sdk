import type { Asset } from './asset.js'

/** @public */
export interface FundingInfo {
  rate: string
  nextFundingTime: number
}

/** @public */
export interface BaseMarket {
  providerId: string
  /** Opaque provider market id; referenced elsewhere as `marketId`. */
  id: string
  /** References a {@link ProviderCategory} by id. */
  categoryId: string
  baseAsset: Asset
  quoteAsset: Asset
  szDecimals: number
  /**
   * Maximum decimal places the venue accepts for order prices on this market.
   * Some venues impose further constraints on top of this budget (e.g. a
   * significant-figure cap), so always format prices through the provider's
   * `formatOrderPrice` rather than applying this field directly.
   */
  priceDecimals?: number
  markPrice: string
  volume24h?: string
  prevDayPrice?: string
}

/** @public */
export interface PerpsMarket extends BaseMarket {
  maxLeverage: number
  onlyIsolated: boolean
  funding: FundingInfo
  openInterest?: string
  /**
   * Venue maintenance margin rate for this market as a fraction (e.g. `0.012`
   * = 1.2%). Feeds client-side liquidation-price estimates via the provider's
   * `estimateLiquidationPrice`.
   */
  maintenanceMarginRate?: number
}

/** @public */
export interface SpotMarket extends BaseMarket {}

/** @public */
export type Market = PerpsMarket | SpotMarket

/** @public */
export type MarketDisplay = Pick<
  BaseMarket,
  'providerId' | 'id' | 'categoryId' | 'baseAsset' | 'quoteAsset'
>

/**
 * Minimal market reference for write-action params: identifies a market by
 * its opaque `marketId` within a `categoryId`. Embeds no Assets — write
 * params reference by id, not value.
 * @public
 */
export interface MarketRef {
  marketId: string
  categoryId: string
}

/** @public */
export interface MarketsResponse {
  markets: Market[]
}

/** @public */
export interface MarketPrice {
  marketId: string
  price: string
}

/** @public */
export interface PricesResponse {
  prices: MarketPrice[]
}

/** @public */
export interface Candle {
  t: number
  o: string
  h: string
  l: string
  c: string
  v: string
}

/** @public */
export interface OhlcvResponse {
  provider: string
  marketId: string
  interval: string
  candles: Candle[]
}

/** @public */
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

/** @public */
export interface OrderbookLevel {
  price: string
  size: string
}

/** @public */
export interface OrderbookResponse {
  provider: string
  marketId: string
  bids: OrderbookLevel[]
  asks: OrderbookLevel[]
  timestamp: number
}
