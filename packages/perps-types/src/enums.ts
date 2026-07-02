/** @public */
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

/** @public */
export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

/** @public */
export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  STOP_MARKET = 'STOP_MARKET',
  STOP_LIMIT = 'STOP_LIMIT',
  TAKE_PROFIT_MARKET = 'TAKE_PROFIT_MARKET',
  TAKE_PROFIT_LIMIT = 'TAKE_PROFIT_LIMIT',
  TRIGGER_ONLY = 'TRIGGER_ONLY',
}

/** @public */
export enum PositionSide {
  LONG = 'LONG',
  SHORT = 'SHORT',
}

/** @public */
export enum MarginMode {
  ISOLATED = 'ISOLATED',
  CROSS = 'CROSS',
}

/** @public */
export enum TimeInForce {
  GTC = 'GTC',
  IOC = 'IOC',
  POST_ONLY = 'POST_ONLY',
  GTT = 'GTT',
}

/** @public */
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

/** @public */
export enum FillStatus {
  FILLED = 'FILLED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

/** @public */
export enum LiquidityRole {
  MAKER = 'maker',
  TAKER = 'taker',
}

/** @public */
export enum ActionType {
  APPROVE_AGENT = 'approveAgent',
  APPROVE_BUILDER_FEE = 'approveBuilderFee',
  SET_REFERRAL = 'setReferrer',
  ACCOUNT_MODE = 'accountMode',
  ACCOUNT_TYPE = 'accountType',
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
  APPROVE_READ_ONLY_TOKEN = 'approveReadOnlyToken',
  DEPOSIT = 'deposit',
  /** Provider-independent: sent with the `META_PROVIDER` sentinel, not a real provider key. */
  META_VOTE = 'metaVote',
  /** Provider-independent: sent with the `META_PROVIDER` sentinel, not a real provider key. */
  META_ACCEPT_TERMS = 'metaAcceptTerms',
}

/** @public */
export enum TriggerCondition {
  ABOVE = 'ABOVE',
  BELOW = 'BELOW',
}

/** @public */
export enum TriggerOrderType {
  TAKE_PROFIT = 'TAKE_PROFIT',
  STOP_LOSS = 'STOP_LOSS',
}

/** @public */
export enum TriggerOrderStatus {
  WAITING = 'WAITING',
  TRIGGERED = 'TRIGGERED',
  CANCELLED = 'CANCELLED',
}

/** @public */
export enum ActivityType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  LIQUIDATION = 'LIQUIDATION',
  FUNDING = 'FUNDING',
  TRANSFER = 'TRANSFER',
}

/** @public */
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

/** @public */
export enum LiquidationClassification {
  LIQUIDATED = 'Liquidated',
}

/** @public */
export enum FundingClassification {
  FUNDING = 'Funding',
}

/** @public */
export enum TransferClassification {
  DEPOSIT = 'Deposit',
  WITHDRAWAL = 'Withdrawal',
  TRANSFER = 'Transfer',
}

/** @public */
export type ActivityClassification =
  | FillClassification
  | LiquidationClassification
  | FundingClassification
  | TransferClassification

/** @public */
export enum PerpsSigner {
  USER = 'USER',
  AGENT = 'AGENT',
  API_KEY = 'API_KEY',
}

/** @public */
export enum SigningMethod {
  EIP712 = 'eip712',
  WASM_BLOB = 'wasmBlob',
  EVM_TX = 'evmTx',
}
