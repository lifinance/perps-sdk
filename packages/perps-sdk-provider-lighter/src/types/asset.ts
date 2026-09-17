// Market / asset / orderbook metadata returned by Lighter's REST API.

import type { Asset } from 'zklighter-perps/models/Asset'
import type { FundingRate } from 'zklighter-perps/models/FundingRate'
import type { MarketConfig } from 'zklighter-perps/models/MarketConfig'
import type { Token } from 'zklighter-perps/models/Token'

/**
 * Venue configuration nested in a Lighter perpetual-market descriptor.
 * Numeric fields are Lighter wire mode values; booleans indicate whether the
 * market is currently restricted or hidden.
 *
 * @public
 */
export type LtMarketConfig = MarketConfig

/**
 * Perpetual-market metadata returned by Lighter's order-book-details endpoint.
 * Decimal strings use the market's native asset/quote precision. Decimal-count
 * fields describe supported and canonical order precision; fee and margin
 * fractions use Lighter's wire representation.
 *
 * @public
 */
export interface LtPerpsOrderBookDetail {
  symbol: string
  market_id: number
  market_type: string
  base_asset_id: number
  quote_asset_id: number
  status: string
  taker_fee: string
  maker_fee: string
  liquidation_fee: string
  min_base_amount: string
  min_quote_amount: string
  order_quote_limit: string
  supported_size_decimals: number
  supported_price_decimals: number
  supported_quote_decimals: number
  size_decimals: number
  price_decimals: number
  quote_multiplier: number
  default_initial_margin_fraction: number
  min_initial_margin_fraction: number
  maintenance_margin_fraction: number
  closeout_margin_fraction: number
  last_trade_price: number
  daily_trades_count: number
  daily_base_token_volume: number
  daily_quote_token_volume: number
  daily_price_low: number
  daily_price_high: number
  daily_price_change: number
  daily_chart: Record<string, unknown>
  open_interest: number
  market_config: LtMarketConfig
  strategy_index: number
}

/**
 * Spot-market metadata returned by Lighter's order-book-details endpoint.
 * Decimal strings use the market's native asset/quote precision; decimal-count
 * fields describe supported order precision.
 *
 * @public
 */
export interface LtSpotOrderBookDetail {
  symbol: string
  market_id: number
  market_type: string
  base_asset_id: number
  quote_asset_id: number
  status: string
  taker_fee: string
  maker_fee: string
  liquidation_fee: string
  min_base_amount: string
  min_quote_amount: string
  order_quote_limit: string
  supported_size_decimals: number
  supported_price_decimals: number
  supported_quote_decimals: number
  size_decimals: number
  price_decimals: number
  last_trade_price: number
  daily_trades_count: number
  daily_base_token_volume: number
  daily_quote_token_volume: number
  daily_price_low: number
  daily_price_high: number
  daily_price_change: number
  daily_chart: Record<string, unknown>
}

/**
 * Response envelope containing both perpetual and spot market descriptors.
 *
 * @public
 */
export interface LtOrderBookDetailsResponse {
  code: number
  order_book_details: LtPerpsOrderBookDetail[]
  spot_order_book_details: LtSpotOrderBookDetail[]
}

/**
 * Token metadata returned by Lighter's token-list endpoint. `market` identifies
 * whether the token is associated with a perpetual or spot market.
 *
 * @public
 */
export type LtToken = Token

/**
 * Response envelope for Lighter's token-list endpoint.
 *
 * @public
 */
export interface LtTokenListResponse {
  code: number
  tokens: LtToken[]
}

/**
 * Asset metadata returned by Lighter. `l1_decimals` is the token precision on
 * L1; `decimals` is the Lighter ledger precision.
 *
 * @public
 */
export type LtAssetDetail = Asset

/**
 * Response envelope for Lighter's asset-details endpoint.
 *
 * @public
 */
export interface LtAssetDetailsResponse {
  code: number
  asset_details: LtAssetDetail[]
}

/**
 * OHLCV candle returned by Lighter. `t` is the candle timestamp in Unix
 * milliseconds; `o`, `h`, `l`, and `c` are prices and `v` is volume.
 *
 * Lighter's OpenAPI marks four further raw-price members — `O`, `H`, `L` and
 * `C` — required on the `/api/v1/candles` model, but live rows omit all four.
 * The `/api/v1/markPriceCandles` model carries no `v` at all.
 *
 * @public
 */
export interface LtCandle {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

/**
 * Response envelope for a Lighter candle query. `r` is the endpoint's result
 * value and `c` contains the returned candles.
 *
 * @public
 */
export interface LtCandlesResponse {
  code: number
  r: string
  c: LtCandle[]
}

/**
 * Funding-rate snapshot for one Lighter perpetual market. `rate` is the
 * funding-rate value the named exchange reports for the market, so the same
 * market appears once per exchange Lighter tracks.
 *
 * @public
 */
export type LtFundingRate = FundingRate

/**
 * Response envelope containing current funding rates by market.
 *
 * @public
 */
export interface LtFundingRatesResponse {
  code: number
  funding_rates: LtFundingRate[]
}
