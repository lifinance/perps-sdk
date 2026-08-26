// Account / balance shapes returned by Lighter's `/api/v1/account` and
// `/api/v1/accountLimits` endpoints.

/**
 * Per-market position row returned by Lighter's account endpoints.
 *
 * Amounts and prices are decimal strings in the market's native precision.
 * `position` is the size magnitude as a decimal string. `sign` is the
 * authoritative side indicator: values greater than or equal to zero represent
 * long positions and values less than zero represent short positions.
 *
 * @public
 */
export type LtAccountPosition = {
  market_id: number
  /** Present on REST `/api/v1/account` rows; WS position frames may omit it. */
  symbol?: string
  initial_margin_fraction: string
  open_order_count: number
  pending_order_count: number
  position_tied_order_count: number
  sign: number
  position: string
  avg_entry_price: string
  position_value: string
  unrealized_pnl: string
  realized_pnl: string
  liquidation_price: string
  /**
   * Funding accrued since the position opened, signed from the account's point
   * of view despite the field name: negative is funding the account paid and
   * positive is funding it received. Lighter resets it to `"0"` on close.
   */
  total_funding_paid_out: string
  margin_mode: number
  allocated_margin: string
  total_discount: string
}

/**
 * Cross-margin collateral flag Lighter reports on an account asset row.
 *
 * @public
 */
export type LtAssetMarginMode = 'enabled' | 'disabled'

/**
 * Held asset row returned in a Lighter account response. The two balances are
 * the asset's two withdrawal routes: `balance` is the spot route
 * (`AssetRouteType_Spot`) and `margin_balance` the perps route
 * (`AssetRouteType_Perps`). All amounts are decimal strings.
 *
 * @public
 */
export type LtAccountAsset = {
  symbol: string
  asset_id: number
  /** Spot-route balance, `locked_balance` included. */
  balance: string
  /** Portion of `balance` reserved by pending activity and not withdrawable. */
  locked_balance: string
  /** Perps-route balance — the asset's collateral leg. */
  margin_balance: string
  /** Collateral weighting Lighter applies to the asset, as a decimal factor. */
  multiplier: string
  /**
   * Lighter surfaces it via `additional_properties`, so it may be absent —
   * chiefly outside Unified Trading Account mode.
   */
  margin_mode?: LtAssetMarginMode
}

/**
 * Account-position row from `/api/v1/account`. Identical shape to
 * `LtAccountPosition` — alias kept for read-side clarity at call sites that
 * fan out off per-market order counts (`open_order_count`,
 * `pending_order_count`, `position_tied_order_count`).
 * @public
 */
export type LtDetailedAccountPosition = LtAccountPosition

/**
 * Integrator approval and fee caps attached to a detailed account.
 * Fee values are Lighter's integer fee ticks; `approval_expiry` is a Unix
 * timestamp.
 *
 * @public
 */
export interface LtApprovedIntegrator {
  account_index: number
  name: string
  max_perps_taker_fee: number
  max_perps_maker_fee: number
  max_spot_taker_fee: number
  max_spot_maker_fee: number
  approval_expiry: number
}

/**
 * Detailed account payload returned by Lighter's account endpoint, including
 * account metadata, aggregate collateral values, assets, and positions.
 * Balance and value fields are decimal strings in the relevant asset/quote
 * precision; numeric status and mode fields are Lighter wire enums.
 *
 * @public
 */
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
  /**
   * Unix timestamp in microseconds. Lighter documents no unit, and its
   * account rows report 16-digit values. A dormant account reports `0`, so
   * treat `0` as "no transaction" and not as the Unix epoch.
   */
  transaction_time: number
  account_trading_mode: number
  account_index: number
  name: string
  description: string
  positions: LtDetailedAccountPosition[]
  assets: LtAccountAsset[]
  total_asset_value: string
  cross_asset_value: string
  /** Initial margin locked by cross positions; isolated positions carry
   * their own `allocated_margin` instead. */
  cross_initial_margin_requirement: string
  approved_integrators?: LtApprovedIntegrator[]
}

/**
 * Response envelope for a detailed-account lookup. `code` is Lighter's
 * endpoint result code and `total` is the number of account rows returned.
 *
 * @public
 */
export interface LtDetailedAccountsResponse {
  code: number
  total: number
  accounts: LtDetailedAccount[]
}

/**
 * Account-level limits and fee information returned by Lighter's
 * `/api/v1/accountLimits` endpoint. Amount fields are decimal strings;
 * `current_*_fee_tick` values use Lighter's integer fee-tick scale.
 *
 * @public
 */
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

/**
 * Sub-account summary returned by Lighter's `accountsByL1Address` endpoint.
 * Balance and collateral values are decimal strings; status and trading-mode
 * fields are Lighter wire values.
 *
 * @public
 */
export interface LtSubAccount {
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
  /**
   * Unix timestamp in microseconds, the same wire member as
   * `LtDetailedAccount.transaction_time`. Lighter leaves it at `0` on the
   * `accountsByL1Address` rows, so read the value from the account endpoint
   * instead.
   */
  transaction_time: number
  account_trading_mode: number
}

/**
 * Response envelope for an L1-address sub-account lookup.
 *
 * @public
 */
export interface LtAccountsByL1AddressResponse {
  code: number
  l1_address: string
  sub_accounts: LtSubAccount[]
}
