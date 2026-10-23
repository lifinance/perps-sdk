import { ActionType } from '@lifi/perps-types'

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
  /** An int64 decimal string, or a number while it is a safe integer. */
  order_index: string | number
}

/**
 * Backend-provided params for SignModifyOrder.
 *
 * @public
 */
export type LtModifyOrderWasmParams = {
  market_index: number
  /** An int64 decimal string, or a number while it is a safe integer. */
  order_index: string | number
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
 * Backend-provided params for SignWithdraw. The asset and route are the
 * caller's selection, not a signer default, and the remaining fields are the
 * venue metadata the signer needs to scale and bounds-check `amount` without
 * an asset registry of its own.
 *
 * @public
 */
export type LtWithdrawWasmParams = {
  /** Lighter L2 `asset_id` being withdrawn. */
  asset_index: number
  /** {@link LT_ROUTE_PERP} or {@link LT_ROUTE_SPOT}; anything else is rejected. */
  route_type: number
  /** Decimal amount in the asset's own units, unscaled. */
  amount: string
  /** The asset's L2 precision — the exponent `amount` is scaled by. */
  decimals: number
  /** Venue minimum for a single withdrawal, in the asset's own units. */
  min_withdrawal_amount: string
  /** Asset symbol, named in a sub-minimum rejection. */
  symbol: string
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
 * Lighter wire value for a TWAP slice. The venue creates it internally; it
 * cannot be placed, and its trades carry client order index `0`.
 * @public
 */
export const LT_ORDER_TYPE_TWAP_SUB = 7

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
 * Lighter account-trading-mode value for the Classic/Simple account, which
 * segregates margin per market. The wire zero value, so an omitted
 * `account_trading_mode` means this mode.
 * @public
 */
export const LT_ACCOUNT_TRADING_MODE_SIMPLE = 0

/**
 * Lighter account-trading-mode value for the Unified Trading Account, which
 * margins across assets.
 * @public
 */
export const LT_ACCOUNT_TRADING_MODE_UNIFIED = 1

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

// Tx type values from lighter-go `types/txtypes/constants.go`.
/**
 * Lighter tx type `TxTypeL2ChangePubKey`.
 * @public
 */
export const LT_TX_TYPE_CHANGE_PUB_KEY = 8
/**
 * Lighter tx type `TxTypeL2Transfer`.
 * @public
 */
export const LT_TX_TYPE_TRANSFER = 12
/**
 * Lighter tx type `TxTypeL2Withdraw`.
 * @public
 */
export const LT_TX_TYPE_WITHDRAW = 13
/**
 * Lighter tx type `TxTypeL2CreateOrder`.
 * @public
 */
export const LT_TX_TYPE_CREATE_ORDER = 14
/**
 * Lighter tx type `TxTypeL2CancelOrder`.
 * @public
 */
export const LT_TX_TYPE_CANCEL_ORDER = 15
/**
 * Lighter tx type `TxTypeL2CancelAllOrders`.
 * @public
 */
export const LT_TX_TYPE_CANCEL_ALL_ORDERS = 16
/**
 * Lighter tx type `TxTypeL2ModifyOrder`.
 * @public
 */
export const LT_TX_TYPE_MODIFY_ORDER = 17
/**
 * Lighter tx type `TxTypeL2UpdateLeverage`.
 * @public
 */
export const LT_TX_TYPE_UPDATE_LEVERAGE = 20
/**
 * Lighter tx type `TxTypeL2UpdateMargin`.
 * @public
 */
export const LT_TX_TYPE_UPDATE_MARGIN = 29
/**
 * Lighter tx type `TxTypeL2UpdateAccountConfig`.
 * @public
 */
export const LT_TX_TYPE_UPDATE_ACCOUNT_CONFIG = 41
/**
 * Lighter tx type `TxTypeL2UpdateAccountAssetConfig`.
 * @public
 */
export const LT_TX_TYPE_UPDATE_ACCOUNT_ASSET_CONFIG = 42
/**
 * Lighter tx type `TxTypeL2ApproveIntegrator`.
 * @public
 */
export const LT_TX_TYPE_APPROVE_INTEGRATOR = 45

/**
 * Lighter tx type of the signed tx the SDK's WASM signer emits for each
 * action. An action without an entry has no Lighter signing path.
 * @public
 */
export const LT_TX_TYPE_BY_ACTION: Readonly<
  Partial<Record<ActionType, number>>
> = Object.freeze({
  [ActionType.REGISTER_API_KEY]: LT_TX_TYPE_CHANGE_PUB_KEY,
  [ActionType.TRANSFER]: LT_TX_TYPE_TRANSFER,
  [ActionType.SEND_ASSET]: LT_TX_TYPE_TRANSFER,
  [ActionType.WITHDRAWAL]: LT_TX_TYPE_WITHDRAW,
  [ActionType.PLACE_ORDER]: LT_TX_TYPE_CREATE_ORDER,
  [ActionType.PLACE_TRIGGER_ORDER]: LT_TX_TYPE_CREATE_ORDER,
  [ActionType.PLACE_TWAP_ORDER]: LT_TX_TYPE_CREATE_ORDER,
  [ActionType.CANCEL_ORDER]: LT_TX_TYPE_CANCEL_ORDER,
  [ActionType.CANCEL_TWAP_ORDER]: LT_TX_TYPE_CANCEL_ORDER,
  [ActionType.CANCEL_ALL_ORDERS]: LT_TX_TYPE_CANCEL_ALL_ORDERS,
  [ActionType.MODIFY_ORDER]: LT_TX_TYPE_MODIFY_ORDER,
  [ActionType.UPDATE_LEVERAGE]: LT_TX_TYPE_UPDATE_LEVERAGE,
  [ActionType.UPDATE_POSITION_MARGIN]: LT_TX_TYPE_UPDATE_MARGIN,
  [ActionType.ACCOUNT_MODE]: LT_TX_TYPE_UPDATE_ACCOUNT_CONFIG,
  [ActionType.UPDATE_ASSET_COLLATERAL]: LT_TX_TYPE_UPDATE_ACCOUNT_ASSET_CONFIG,
  [ActionType.APPROVE_INTEGRATOR]: LT_TX_TYPE_APPROVE_INTEGRATOR,
  [ActionType.REVOKE_INTEGRATOR]: LT_TX_TYPE_APPROVE_INTEGRATOR,
})
