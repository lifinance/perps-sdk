import type { Asset } from './asset.js'
import type { PositionMarginAdjustment } from './enums.js'

/**
 * Current funding rate and next funding timestamp for a perpetual market.
 * `rate` is a decimal fraction; `nextFundingTime` is Unix milliseconds.
 *
 * @public
 */
export interface FundingInfo {
  /** Funding rate as a decimal fraction. */
  rate: string
  /** Next funding timestamp in Unix milliseconds. */
  nextFundingTime: number
}

/**
 * Shared market metadata for perpetual and spot instruments.
 *
 * @public
 */
export interface BaseMarket {
  providerId: string
  /** Opaque provider market id; referenced elsewhere as `marketId`. */
  id: string
  isDelisted?: boolean
  /** References a {@link ProviderCategory} by id. */
  categoryId: string
  baseAsset: Asset
  quoteAsset: Asset
  /** Maximum fractional precision accepted for order sizes. */
  szDecimals: number
  /**
   * Maximum decimal places the venue accepts for order prices on this market.
   * Some venues impose further constraints on top of this budget (e.g. a
   * significant-figure cap), so always format prices through the provider's
   * `formatOrderPrice` rather than applying this field directly.
   */
  priceDecimals?: number
  /**
   * Exact price tick as a plain decimal string (e.g. `'0.25'`). Present when
   * the venue's grid is not a power of ten, where `priceDecimals` alone cannot
   * describe the tick. Format prices through the provider's `formatOrderPrice`
   * rather than applying this field directly.
   */
  priceIncrement?: string
  /**
   * Exact size lot as a plain decimal string (e.g. `'0.05'`). Present when the
   * venue's grid is not a power of ten, where `szDecimals` alone cannot
   * describe the lot. Format sizes through the provider's `formatOrderSize`
   * rather than applying this field directly.
   */
  sizeIncrement?: string
}

/**
 * Perpetual market metadata, including leverage and margin constraints.
 *
 * @public
 */
export interface PerpsMarket extends BaseMarket {
  maxLeverage: number
  onlyIsolated: boolean
  /** Whether individual position margin can be added and/or removed. */
  positionMarginAdjustment: PositionMarginAdjustment
  /**
   * Venue maintenance margin rate for this market as a fraction (e.g. `0.012`
   * = 1.2%). Feeds client-side liquidation-price estimates via the provider's
   * `estimateLiquidationPrice`.
   */
  maintenanceMarginRate?: number
}

/**
 * Spot markets cannot expose perpetual-position margin capabilities.
 * @public
 */
export interface SpotMarket extends BaseMarket {
  positionMarginAdjustment?: never
}

/** Union of perpetual and spot market representations. @public */
export type Market = PerpsMarket | SpotMarket

/**
 * UI-safe market projection containing identity, category, assets, and
 * delisting state without provider-specific trading constraints.
 *
 * @public
 */
export type MarketDisplay = Pick<
  BaseMarket,
  'providerId' | 'id' | 'categoryId' | 'baseAsset' | 'quoteAsset' | 'isDelisted'
>

/** Perpetual-market identity embedded on an open {@link Position}. @public */
export type PerpsMarketDisplay = Pick<
  PerpsMarket,
  | 'providerId'
  | 'id'
  | 'categoryId'
  | 'baseAsset'
  | 'quoteAsset'
  | 'isDelisted'
  | 'positionMarginAdjustment'
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

/** Response containing all markets returned for a provider. @public */
export interface MarketsResponse {
  markets: Market[]
}

/**
 * Live per-market context: `midPrice` is the order-book mid, `markPrice` the
 * venue mark, `oraclePrice` the venue oracle/index price where the venue
 * publishes one. `prevDayPrice`, `priceChange24h` and `volume24h` apply to
 * every market type; `marketCap` is present when the venue publishes
 * circulating supply, while `openInterest` and `funding` are perp-only and
 * absent for spot.
 * @public
 */
export interface MarketContext {
  /** Opaque provider market identifier for this context frame. */
  marketId: string
  /** Current order-book midpoint, as a decimal quote string. */
  midPrice: string
  /** Provider mark price, as a decimal quote string. */
  markPrice: string
  oraclePrice?: string
  prevDayPrice?: string
  priceChange24h?: string
  volume24h?: string
  marketCap?: string
  openInterest?: string
  funding?: FundingInfo
}

/** Response containing live context for requested markets. @public */
export interface PricesResponse {
  prices: MarketContext[]
}

/**
 * OHLCV candle with Unix-millisecond open time and decimal-string OHLCV
 * values. Field names follow the compact provider response shape.
 *
 * @public
 */
export interface Candle {
  t: number
  o: string
  h: string
  l: string
  c: string
  v: string
}

/** Response containing candles for one provider market and interval. @public */
export interface OhlcvResponse {
  provider: string
  marketId: string
  interval: string
  candles: Candle[]
}

/**
 * Supported OHLCV intervals. Values are wire interval strings (`1M` is one
 * month; lowercase `m` values are minutes).
 *
 * @public
 */
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

/** One price/size level in an order book; both values are decimal strings. @public */
export interface OrderbookLevel {
  price: string
  size: string
}

/** Snapshot of bids and asks for one market. `timestamp` is Unix milliseconds. @public */
export interface OrderbookResponse {
  provider: string
  marketId: string
  bids: OrderbookLevel[]
  asks: OrderbookLevel[]
  timestamp: number
}

/** Recent trade normalized for a market; `timestamp` is Unix milliseconds. @public */
export interface Trade {
  provider: string
  marketId: string
  price: string
  size: string
  timestamp: number
  side: 'buy' | 'sell'
  id?: string
}
