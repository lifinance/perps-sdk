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
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  STOP_MARKET = 'STOP_MARKET',
  STOP_LIMIT = 'STOP_LIMIT',
  TAKE_PROFIT_MARKET = 'TAKE_PROFIT_MARKET',
  TAKE_PROFIT_LIMIT = 'TAKE_PROFIT_LIMIT',
  TRIGGER_ONLY = 'TRIGGER_ONLY',
}

export enum PositionSide {
  LONG = 'LONG',
  SHORT = 'SHORT',
}

export enum MarginMode {
  ISOLATED = 'ISOLATED',
  CROSS = 'CROSS',
}

export enum TimeInForce {
  GTC = 'GTC',
  IOC = 'IOC',
  POST_ONLY = 'POST_ONLY',
  GTT = 'GTT',
}

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

export enum FillStatus {
  FILLED = 'FILLED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

export enum LiquidityRole {
  MAKER = 'maker',
  TAKER = 'taker',
}

export enum ActionType {
  APPROVE_AGENT = 'approveAgent',
  APPROVE_BUILDER_FEE = 'approveBuilderFee',
  /**
   * Generic account-level operating mode (e.g. Hyperliquid abstraction
   * variants, Lighter UTA / Simple). Replaces the provider-specific
   * `USER_SET_ABSTRACTION` / `AGENT_SET_ABSTRACTION` action pair on the
   * public surface; HL maps it to the appropriate EIP-712 typed-data
   * builder internally.
   */
  ACCOUNT_MODE = 'accountMode',
  /**
   * Generic account-level fee/latency tier (e.g. Lighter standard /
   * premium). Providers that have no tiering (Hyperliquid) omit this
   * action from their descriptor list.
   */
  ACCOUNT_TYPE = 'accountType',
  /**
   * @deprecated Use `ACCOUNT_MODE` instead. Retained as an alias to keep
   * the consumer surface (perps-sdk, lifi-perps-backend, perps-dex-widget)
   * compiling while ORD-265/266/267 migrate to the generic action. Will
   * be removed once those land — see the follow-up issue filed against
   * this PR.
   */
  USER_SET_ABSTRACTION = 'userSetAbstraction',
  /**
   * @deprecated Use `ACCOUNT_MODE` instead. See `USER_SET_ABSTRACTION`.
   */
  AGENT_SET_ABSTRACTION = 'agentSetAbstraction',
  SEND_ASSET = 'sendAsset',
  WITHDRAWAL = 'withdrawal',
  TRANSFER = 'transfer',
  PLACE_ORDER = 'placeOrder',
  PLACE_TRIGGER_ORDER = 'placeTriggerOrder',
  CANCEL_ORDER = 'cancelOrder',
  CANCEL_ALL_ORDERS = 'cancelAllOrders',
  MODIFY_ORDER = 'modifyOrder',
  UPDATE_LEVERAGE = 'updateLeverage',
  UPDATE_POSITION_MARGIN = 'updatePositionMargin',
  REGISTER_API_KEY = 'registerApiKey',
  DEPOSIT = 'deposit',
}

export enum TriggerCondition {
  ABOVE = 'ABOVE',
  BELOW = 'BELOW',
}

export enum TriggerOrderType {
  TAKE_PROFIT = 'TAKE_PROFIT',
  STOP_LOSS = 'STOP_LOSS',
}

export enum TriggerOrderStatus {
  WAITING = 'WAITING',
  TRIGGERED = 'TRIGGERED',
  CANCELLED = 'CANCELLED',
}

export enum ActivityType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  LIQUIDATION = 'LIQUIDATION',
  FUNDING = 'FUNDING',
  TRANSFER = 'TRANSFER',
}

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

export enum LiquidationClassification {
  LIQUIDATED = 'Liquidated',
}

export enum FundingClassification {
  FUNDING = 'Funding',
}

export enum TransferClassification {
  DEPOSIT = 'Deposit',
  WITHDRAWAL = 'Withdrawal',
}

export type ActivityClassification =
  | FillClassification
  | LiquidationClassification
  | FundingClassification
  | TransferClassification

export enum PerpsSigner {
  USER = 'USER',
  AGENT = 'AGENT',
  API_KEY = 'API_KEY',
}

export enum SigningMethod {
  EIP712 = 'eip712',
  WASM_BLOB = 'wasmBlob',
  EVM_TX = 'evmTx',
}
