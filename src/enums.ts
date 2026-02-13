export enum PerpsErrorCode {
  // Base errors (2000-2009)
  DefaultError = 2000,
  ServerError = 2001,
  ValidationError = 2002,
  TimeoutError = 2003,
  ThirdPartyError = 2004,

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

export enum HistoryItemStatus {
  FILLED = 'FILLED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

export enum OrderActionType {
  UPDATE_LEVERAGE = 'updateLeverage',
  PLACE_ORDER = 'placeOrder',
  PLACE_TRIGGER_ORDER = 'placeTriggerOrder',
  CANCEL_ORDER = 'cancelOrder',
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
