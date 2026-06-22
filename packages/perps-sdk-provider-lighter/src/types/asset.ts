// Market / asset / orderbook metadata returned by Lighter's REST API.

/** @public */
export interface LtMarketConfig {
  market_margin_mode: number
  insurance_fund_account_index: number
  liquidation_mode: number
  force_reduce_only: boolean
  trading_hours: string
  funding_fee_discounts_enabled: boolean
  hidden: boolean
}

/** @public */
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

/** @public */
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

/** @public */
export interface LtOrderBookDetailsResponse {
  code: number
  order_book_details: LtPerpsOrderBookDetail[]
  spot_order_book_details: LtSpotOrderBookDetail[]
}

/** @public */
export interface LtToken {
  symbol: string
  name: string
  logo: string
  logo_extension: string
  market: 'PERPS' | 'SPOT'
}

/** @public */
export interface LtTokenListResponse {
  code: number
  tokens: LtToken[]
}

/** @public */
export interface LtAssetDetail {
  asset_id: number
  symbol: string
  l1_decimals: number
  decimals: number
  l1_address: string
}

/** @public */
export interface LtAssetDetailsResponse {
  code: number
  asset_details: LtAssetDetail[]
}

/** @public */
export interface LtCandle {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

/** @public */
export interface LtCandlesResponse {
  code: number
  r: string
  c: LtCandle[]
}

/** @public */
export interface LtFundingRate {
  market_id: number
  exchange: string
  symbol: string
  rate: number
}

/** @public */
export interface LtFundingRatesResponse {
  code: number
  funding_rates: LtFundingRate[]
}
