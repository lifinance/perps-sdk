// Lighter raw API response types — derived from the OpenAPI spec at
// https://github.com/elliottech/lighter-python/blob/main/openapi.json
// Kept SDK-side as a superset of @lifi/perps-types/providers/lighter so we
// can carry response-shape fields the mappers don't need but the read
// projectors do (e.g. open_order_count, cancel_all_time).

import type {
  LtAccountAsset,
  LtAccountPosition,
  LtOrder,
  LtTrade,
} from '@lifi/perps-types/providers/lighter'

export type {
  LtAccountAsset,
  LtAccountPosition,
  LtOrder,
  LtTrade,
} from '@lifi/perps-types/providers/lighter'

export interface LtMarketConfig {
  market_margin_mode: number
  insurance_fund_account_index: number
  liquidation_mode: number
  force_reduce_only: boolean
  trading_hours: string
  funding_fee_discounts_enabled: boolean
  hidden: boolean
}

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
  open_interest: number
  market_config: LtMarketConfig
  strategy_index: number
}

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
}

export interface LtOrderBookDetailsResponse {
  code: number
  order_book_details: LtPerpsOrderBookDetail[]
  spot_order_book_details: LtSpotOrderBookDetail[]
}

export interface LtToken {
  symbol: string
  name: string
  logo: string
  logo_extension: string
  market: 'PERPS' | 'SPOT'
}

export interface LtTokenListResponse {
  code: number
  tokens: LtToken[]
}

export interface LtAssetDetail {
  asset_id: number
  symbol: string
  l1_decimals: number
  decimals: number
  l1_address: string
}

export interface LtAssetDetailsResponse {
  code: number
  asset_details: LtAssetDetail[]
}

export interface LtOrderBookOrder {
  order_index: number
  order_id: string
  owner_account_index: number
  initial_base_amount: string
  remaining_base_amount: string
  price: string
  order_expiry: number
  transaction_time: number
}

export interface LtOrderBookOrdersResponse {
  code: number
  total_asks: number
  asks: LtOrderBookOrder[]
  total_bids: number
  bids: LtOrderBookOrder[]
}

export interface LtCandle {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

export interface LtCandlesResponse {
  code: number
  r: string
  c: LtCandle[]
}

/**
 * Account-position row from `/api/v1/account`. Identical to the trade-row
 * shape `LtAccountPosition` in `@lifi/perps-types/providers/lighter`; the
 * per-market order counts the orders fan-out keys off (`open_order_count`,
 * `pending_order_count`, `position_tied_order_count`) are already required
 * fields on the shared shape, so no additional fields need declaring here.
 */
export type LtDetailedAccountPosition = LtAccountPosition

export interface LtApprovedIntegrator {
  account_index: number
  name: string
  max_perps_taker_fee: number
  max_perps_maker_fee: number
  max_spot_taker_fee: number
  max_spot_maker_fee: number
  approval_expiry: number
}

export interface LtDetailedAccount {
  code: number
  account_type: number
  index: number
  l1_address: string
  cancel_all_time: number
  total_order_count: number
  total_isolated_order_count: number
  pending_order_count: number
  available_balance: string
  status: number
  collateral: string
  transaction_time: number
  account_trading_mode: number
  account_index: number
  name: string
  description: string
  positions: LtDetailedAccountPosition[]
  assets: LtAccountAsset[]
  total_asset_value: string
  cross_asset_value: string
  approved_integrators?: LtApprovedIntegrator[]
}

export interface LtDetailedAccountsResponse {
  code: number
  total: number
  accounts: LtDetailedAccount[]
}

export interface LtOrdersResponse {
  code: number
  next_cursor: string
  orders: LtOrder[]
}

export interface LtTradesResponse {
  code: number
  next_cursor: string
  trades: LtTrade[]
}

export interface LtFundingRate {
  market_id: number
  exchange: string
  symbol: string
  rate: number
}

export interface LtFundingRatesResponse {
  code: number
  funding_rates: LtFundingRate[]
}

export interface LtDepositHistoryItem {
  id: string
  asset_id: number
  amount: string
  timestamp: number
  status: string
  l1_tx_hash: string
}

export interface LtDepositHistoryResponse {
  code: number
  deposits: LtDepositHistoryItem[]
  cursor?: string
}

export interface LtWithdrawHistoryItem {
  id: string
  asset_id: number
  amount: string
  timestamp: number
  status: string
  type: string
  l1_tx_hash: string
}

export interface LtWithdrawHistoryResponse {
  code: number
  withdraws: LtWithdrawHistoryItem[]
  cursor?: string
}

export interface LtPositionFunding {
  timestamp: number
  market_id: number
  funding_id: number
  change: string
  rate: string
  position_size: string
  position_side: string
}

export interface LtPositionFundingsResponse {
  code: number
  position_fundings: LtPositionFunding[]
  next_cursor?: string
}

export interface LtLiquidation {
  id: number
  market_id: number
  type: string
  executed_at: number
}

export interface LtLiquidationsResponse {
  code: number
  liquidations: LtLiquidation[]
  next_cursor?: string
}

export interface LtTransfer {
  id: string
  asset_id: number
  amount: string
  fee: string
  timestamp: number
  type: string
  from_l1_address: string
  to_l1_address: string
  from_account_index: number
  to_account_index: number
  from_route: 'spot' | 'perps'
  to_route: 'spot' | 'perps'
  tx_hash: string
}

export interface LtTransferHistoryResponse {
  code: number
  transfers: LtTransfer[]
  cursor?: string
}

export interface LtAccountLimits {
  code: number
  message?: string
  max_llp_percentage: number
  max_llp_amount: string
  user_tier: string
  user_tier_name?: string
  can_create_public_pool: boolean
  current_maker_fee_tick: number
  current_taker_fee_tick: number
  leased_lit: string
  effective_lit_stakes: string
}
