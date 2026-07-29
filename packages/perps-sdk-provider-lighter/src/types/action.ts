// Shapes of `wasmSignParams` per action. The backend populates these and the
// SDK passes them to the WASM signer alongside SDK-managed fields (nonce,
// account_index, api_key_index).

/**
 * Backend-provided params for SignCreateOrder.
 *
 * @public
 */
export type LtCreateOrderWasmParams = {
  market_index: number
  client_order_index: number
  base_amount: number
  price: number
  is_ask: number
  order_type: number
  time_in_force: number
  reduce_only: boolean
  trigger_price: number
  order_expiry: number
  integrator_account_index: number
  integrator_taker_fee: number
  integrator_maker_fee: number
}

/**
 * Backend-provided params for SignCancelOrder.
 *
 * @public
 */
export type LtCancelOrderWasmParams = {
  market_index: number
  order_index: number
}

/**
 * Backend-provided params for SignModifyOrder.
 *
 * @public
 */
export type LtModifyOrderWasmParams = {
  market_index: number
  order_index: number
  base_amount: number
  price: number
  trigger_price: number
  integrator_account_index: number
  integrator_taker_fee: number
  integrator_maker_fee: number
}

/**
 * Backend-provided params for SignUpdateLeverage.
 *
 * @public
 */
export type LtUpdateLeverageWasmParams = {
  market_index: number
  fraction: number
  margin_mode: number
}

/**
 * Backend-provided params for SignUpdateMargin.
 *
 * @public
 */
export type LtUpdateMarginWasmParams = {
  market_index: number
  usdc_amount: number
  direction: number
}

/**
 * Backend-provided params for SignWithdraw. `asset_index` and `route_type`
 * are not part of this shape — the signer sources both from the configured
 * instance collateral asset and the perps route, so the backend must not
 * send them.
 *
 * @public
 */
export type LtWithdrawWasmParams = {
  amount: number
}

/**
 * Backend-provided params for SignCancelAllOrders.
 *
 * @public
 */
export type LtCancelAllOrdersWasmParams = {
  /** 0=immediate (cancel GTC), 1=scheduled, 2=abort scheduled */
  time_in_force: number
  /** Unix timestamp in milliseconds. Use Date.now() for immediate cancels. */
  timestamp_ms: number
}

/**
 * Backend-provided params for SignChangePubKey (REGISTER_API_KEY).
 *
 * Hybrid signing: this action requires both a WASM blob and an L1 Ethereum
 * signature (the user's wallet signs the ChangePubKey message). The SDK
 * generates the keypair via the WASM signer and fills in `new_public_key`
 * before invoking SignChangePubKey.
 * @public
 */
export type LtChangePubKeyWasmParams = {
  /** API key slot index to register (0-255). SDK fills in the generated public key. */
  api_key_index: number
  nonce: number
}

/**
 * Lighter wire value for limit orders.
 * @public
 */
export const LT_ORDER_TYPE_LIMIT = 0
/**
 * Lighter wire value for market orders.
 * @public
 */
export const LT_ORDER_TYPE_MARKET = 1
/**
 * Lighter wire value for stop-loss market orders.
 * @public
 */
export const LT_ORDER_TYPE_STOP_LOSS = 2
/**
 * Lighter wire value for stop-loss limit orders.
 * @public
 */
export const LT_ORDER_TYPE_STOP_LOSS_LIMIT = 3
/**
 * Lighter wire value for take-profit market orders.
 * @public
 */
export const LT_ORDER_TYPE_TAKE_PROFIT = 4
/**
 * Lighter wire value for take-profit limit orders.
 * @public
 */
export const LT_ORDER_TYPE_TAKE_PROFIT_LIMIT = 5
/**
 * Lighter wire value for TWAP orders.
 * @public
 */
export const LT_ORDER_TYPE_TWAP = 6

/**
 * Lighter wire value for immediate-or-cancel time in force.
 * @public
 */
export const LT_TIME_IN_FORCE_IOC = 0
/**
 * Lighter wire value for good-til-cancelled time in force.
 * @public
 */
export const LT_TIME_IN_FORCE_GTC = 1
/**
 * Lighter wire value for post-only time in force.
 * @public
 */
export const LT_TIME_IN_FORCE_POST_ONLY = 2

/**
 * Lighter cross-margin mode value.
 * @public
 */
export const LT_MARGIN_MODE_CROSS = 0
/**
 * Lighter isolated-margin mode value.
 * @public
 */
export const LT_MARGIN_MODE_ISOLATED = 1

/**
 * Lighter margin-direction value for removing margin.
 * @public
 */
export const LT_MARGIN_DIRECTION_REMOVE = 0
/**
 * Lighter margin-direction value for adding margin.
 * @public
 */
export const LT_MARGIN_DIRECTION_ADD = 1

/**
 * Lighter route selector for perpetuals transfers.
 * @public
 */
export const LT_ROUTE_PERP = 0
/**
 * Lighter route selector for spot transfers.
 * @public
 */
export const LT_ROUTE_SPOT = 1

/**
 * L2 asset index of USDC on Lighter mainnet — the collateral slot mainnet
 * withdrawals, transfers and L1 bridge deposits address. Other deployments
 * settle in their own asset; see `LIGHTER_COLLATERAL_ASSETS`.
 * @public
 */
export const LT_ASSET_ID_USDC = 3

/**
 * Wire sentinel for an omitted trigger price.
 * @public
 */
export const LT_NIL_TRIGGER_PRICE = 0
/**
 * Sentinel the lighter-go WASM signer translates to "default 28-day expiry
 * from now" at sign time (`wasm/main.go:325`, `wasm/main.go:898`). On the
 * wire, `OrderExpiry` is an *absolute* Unix-ms timestamp, not a duration;
 * `-1` lets the signer fill in the default, any positive int64 sets an
 * explicit absolute expiry. Matches lighter-python's
 * `DEFAULT_28_DAY_ORDER_EXPIRY`.
 * @public
 */
export const LT_DEFAULT_ORDER_EXPIRY = -1
