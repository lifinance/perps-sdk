/**
 * Numeric error codes returned by the perps API.
 *
 * @public
 */
export enum PerpsErrorCode {
  // Base errors (2000-2009)
  DefaultError = 2000,
  ServerError = 2001,
  ValidationError = 2002,
  TimeoutError = 2003,
  ThirdPartyError = 2004,
  SDKError = 2005,

  // Auth errors (2010-2019)
  SignatureInvalid = 2010,
  AgentUnauthorized = 2011,
  TermsNotAccepted = 2012,
  /** Rejected or invalid caller credential (e.g. API key); maps to HTTP 401. */
  Unauthorized = 2013,

  // Trading errors (2020-2039)
  ExchangeRejected = 2020,
  InsufficientMargin = 2021,
  InsufficientBalance = 2022,
  MarketNotFound = 2023,
  OrderNotFound = 2024,
  PositionNotFound = 2025,
  AccountNotFound = 2026,

  // Nonce errors (2040-2049)
  InvalidNonce = 2040,
  NonceAlreadyUsed = 2041,
  NonceExpired = 2042,

  // Payload errors (2050-2059)
  PayloadMismatch = 2050,

  // Routing errors (2060-2069)
  RouteNotFound = 2060,

  // Setup errors (2070-2079)
  /**
   * The account exists, but a recoverable provider setup action must be
   * completed before the requested operation can be retried.
   */
  SetupRequired = 2070,
}

/** Side of an order or execution, using provider wire values. @public */
export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

/** Supported regular and trigger order kinds, using provider wire values. @public */
export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  STOP_MARKET = 'STOP_MARKET',
  STOP_LIMIT = 'STOP_LIMIT',
  TAKE_PROFIT_MARKET = 'TAKE_PROFIT_MARKET',
  TAKE_PROFIT_LIMIT = 'TAKE_PROFIT_LIMIT',
  TRIGGER_ONLY = 'TRIGGER_ONLY',
  /** Read-side only: TWAP parents/children surfaced in venue order feeds. Excluded from `PlaceOrderParams.type` — placement goes through `ActionType.PLACE_TWAP_ORDER`. */
  TWAP = 'TWAP',
}

/** Direction of an open position. @public */
export enum PositionSide {
  LONG = 'LONG',
  SHORT = 'SHORT',
}

/** Margin allocation mode for a position. @public */
export enum MarginMode {
  ISOLATED = 'ISOLATED',
  CROSS = 'CROSS',
}

/** Per-market support for changing an open position's dedicated margin. @public */
export enum PositionMarginAdjustment {
  /** The venue does not expose individual position margin. */
  NONE = 'NONE',
  /** Margin can be added but cannot be removed. */
  ADD_ONLY = 'ADD_ONLY',
  /** Margin can be added and removed. */
  ADD_AND_REMOVE = 'ADD_AND_REMOVE',
}

/** Provider order time-in-force policies. @public */
export enum TimeInForce {
  GTC = 'GTC',
  IOC = 'IOC',
  POST_ONLY = 'POST_ONLY',
  GTT = 'GTT',
}

/** Lifecycle status of a provider order. @public */
export enum OrderStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  TRIGGERED = 'TRIGGERED',
}

/** Lifecycle status of an execution/fill. @public */
export enum FillStatus {
  FILLED = 'FILLED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

/** Whether a fill supplied maker or taker liquidity. @public */
export enum LiquidityRole {
  MAKER = 'maker',
  TAKER = 'taker',
}

/**
 * Action identifiers used in setup, create-action, and execute-action
 * requests. Values are the backend wire strings.
 *
 * @public
 */
export enum ActionType {
  APPROVE_AGENT = 'approveAgent',
  APPROVE_BUILDER_FEE = 'approveBuilderFee',
  APPROVE_INTEGRATOR = 'approveIntegrator',
  SET_REFERRAL = 'setReferrer',
  ACCOUNT_MODE = 'accountMode',
  ACCOUNT_TYPE = 'accountType',
  SEND_ASSET = 'sendAsset',
  WITHDRAWAL = 'withdrawal',
  TRANSFER = 'transfer',
  PLACE_ORDER = 'placeOrder',
  PLACE_TRIGGER_ORDER = 'placeTriggerOrder',
  PLACE_TWAP_ORDER = 'placeTwapOrder',
  CANCEL_ORDER = 'cancelOrder',
  CANCEL_ALL_ORDERS = 'cancelAllOrders',
  CANCEL_TWAP_ORDER = 'cancelTwapOrder',
  MODIFY_ORDER = 'modifyOrder',
  UPDATE_LEVERAGE = 'updateLeverage',
  UPDATE_POSITION_MARGIN = 'updatePositionMargin',
  UPDATE_ASSET_COLLATERAL = 'updateAssetCollateral',
  REGISTER_API_KEY = 'registerApiKey',
  APPROVE_READ_ONLY_TOKEN = 'approveReadOnlyToken',
  SIWE_LOGIN = 'siweLogin',
  CREATE_DEPOSIT_ADDRESS = 'createDepositAddress',
  /** Provider-level (venue) terms acceptance, executed client-side with the provider session credential. Distinct from `META_ACCEPT_TERMS`, which covers LI.FI's own app-wide terms. */
  ACCEPT_PROVIDER_TERMS = 'acceptProviderTerms',
  DEPOSIT = 'deposit',
  /** Provider-independent: sent with the `META_PROVIDER` sentinel, not a real provider key. */
  META_VOTE = 'metaVote',
  /** Provider-independent: sent with the `META_PROVIDER` sentinel, not a real provider key. */
  META_ACCEPT_TERMS = 'metaAcceptTerms',
}

/** Price relation that activates a trigger order. @public */
export enum TriggerCondition {
  ABOVE = 'ABOVE',
  BELOW = 'BELOW',
}

/** Take-profit or stop-loss trigger order classification. @public */
export enum TriggerOrderType {
  TAKE_PROFIT = 'TAKE_PROFIT',
  STOP_LOSS = 'STOP_LOSS',
}

/** Lifecycle status of a trigger order. @public */
export enum TriggerOrderStatus {
  WAITING = 'WAITING',
  TRIGGERED = 'TRIGGERED',
  CANCELLED = 'CANCELLED',
}

/** Lifecycle status of a running TWAP order. @public */
export enum TwapOrderStatus {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** Account activity record categories. @public */
export enum ActivityType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  LIQUIDATION = 'LIQUIDATION',
  FUNDING = 'FUNDING',
  TRANSFER = 'TRANSFER',
}

/** Human-readable classification of how a fill changed a position. @public */
export enum FillClassification {
  OPENED_LONG = 'Opened Long',
  OPENED_SHORT = 'Opened Short',
  INCREASED_LONG = 'Increased Long',
  INCREASED_SHORT = 'Increased Short',
  REDUCED_LONG = 'Reduced Long',
  REDUCED_SHORT = 'Reduced Short',
  CLOSED_LONG = 'Closed Long',
  CLOSED_SHORT = 'Closed Short',
  SWITCHED_LONG = 'Switched Long',
  SWITCHED_SHORT = 'Switched Short',
  SPOT_BUY = 'Spot Buy',
  SPOT_SELL = 'Spot Sell',
}

/** Classification emitted for a liquidation activity. @public */
export enum LiquidationClassification {
  LIQUIDATED = 'Liquidated',
}

/** Classification emitted for a funding activity. @public */
export enum FundingClassification {
  FUNDING = 'Funding',
}

/** Classification emitted for an inbound, outbound, or internal transfer. @public */
export enum TransferClassification {
  DEPOSIT = 'Deposit',
  WITHDRAWAL = 'Withdrawal',
  TRANSFER = 'Transfer',
}

/** Union of classifications emitted by all activity record categories. @public */
export type ActivityClassification =
  | FillClassification
  | LiquidationClassification
  | FundingClassification
  | TransferClassification

/**
 * Who completes signing for an action.
 *
 * `USER` — the end-user's wallet must sign or consent; widgets should expect a
 * wallet interaction. `SDK` — the provider package completes signing with
 * credentials it holds or creates, with no user interaction.
 *
 * @public
 */
export enum PerpsSigner {
  USER = 'USER',
  SDK = 'SDK',
}

/**
 * Signing mechanisms supported by action steps. Values are serialized in
 * provider metadata and action responses.
 *
 * @public
 */
export enum SigningMethod {
  EIP712 = 'eip712',
  WASM_BLOB = 'wasmBlob',
  EVM_TX = 'evmTx',
  /** Per-request HMAC signature computed SDK-side from a client-held API key; the signed step rides the normal `executeAction` path. */
  HMAC = 'hmac',
  /** ERC-4361 `personal_sign` over a backend-built login challenge. */
  SIWE = 'siwe',
  /** Client-only venue REST call authorized by a provider session token; produces no backend-bound signed step, so `executeAction` is skipped. */
  SESSION = 'session',
}
