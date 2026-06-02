// Shapes of `wasmSignParams` per action. The backend populates these and the
// SDK passes them to the WASM signer alongside SDK-managed fields (nonce,
// account_index, api_key_index).

/** Backend-provided params for SignCreateOrder. */
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

/** Backend-provided params for SignCancelOrder. */
export type LtCancelOrderWasmParams = {
  market_index: number
  order_index: number
}

/** Backend-provided params for SignModifyOrder. */
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

/** Backend-provided params for SignUpdateLeverage. */
export type LtUpdateLeverageWasmParams = {
  market_index: number
  fraction: number
  margin_mode: number
}

/** Backend-provided params for SignUpdateMargin. */
export type LtUpdateMarginWasmParams = {
  market_index: number
  usdc_amount: number
  direction: number
}

/** Backend-provided params for SignWithdraw. */
export type LtWithdrawWasmParams = {
  asset_index: number
  route_type: number
  amount: number
}

/** Backend-provided params for SignCancelAllOrders. */
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
 */
export type LtChangePubKeyWasmParams = {
  /** API key slot index to register (0-255). SDK fills in the generated public key. */
  api_key_index: number
  nonce: number
}

export const LT_ORDER_TYPE_LIMIT = 0
export const LT_ORDER_TYPE_MARKET = 1
export const LT_ORDER_TYPE_STOP_LOSS = 2
export const LT_ORDER_TYPE_STOP_LOSS_LIMIT = 3
export const LT_ORDER_TYPE_TAKE_PROFIT = 4
export const LT_ORDER_TYPE_TAKE_PROFIT_LIMIT = 5
export const LT_ORDER_TYPE_TWAP = 6

export const LT_TIME_IN_FORCE_IOC = 0
export const LT_TIME_IN_FORCE_GTC = 1
export const LT_TIME_IN_FORCE_POST_ONLY = 2

export const LT_MARGIN_MODE_CROSS = 0
export const LT_MARGIN_MODE_ISOLATED = 1

export const LT_MARGIN_DIRECTION_REMOVE = 0
export const LT_MARGIN_DIRECTION_ADD = 1

export const LT_ROUTE_PERP = 0
export const LT_ROUTE_SPOT = 1

export const LT_ASSET_ID_USDC = 3

export const LT_NIL_TRIGGER_PRICE = 0
export const LT_DEFAULT_ORDER_EXPIRY = -1
