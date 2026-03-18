// Client

// Types
export * from '@lifi/perps-types'
// Agent
export { AgentManager } from './agent/AgentManager.js'
export { createMemoryStorage, localStorageAdapter } from './agent/storage.js'
export type { Agent, StorageAdapter } from './agent/types.js'
export type {
  PerpsBaseConfig,
  PerpsConfig,
  PerpsSDKClient,
  RequestInterceptor,
  SDKRequestOptions,
} from './client/createPerpsClient.js'
export {
  createPerpsClient,
  DEFAULT_API_URL,
} from './client/createPerpsClient.js'
export { PerpsClient } from './client/PerpsClient.js'
export type {
  BuildAuthorizationParams,
  BuildWithdrawalParams,
  CancelOrdersParams,
  ExecuteAuthorizationsParams,
  ExecuteAuthorizationsResult,
  GetRequiredAuthorizationsParams,
  ModifyOrdersParams,
  PerpsClientOptions,
  PlaceOrderParams,
  PlaceTriggerOrderParams,
  RequiredAuthorizationsResult,
  SigningMode,
} from './client/types.js'
// Errors
export { PerpsErrorMessage } from './errors/constants.js'
export { PerpsError } from './errors/PerpsError.js'
// Realtime
export { PerpsWsClient } from './realtime/PerpsWsClient.js'
export type { EventForSubscription } from './realtime/types.js'
export type { CancelOrderParams } from './services/cancelOrder.js'
// Services
export { cancelOrder } from './services/cancelOrder.js'
export type { CreateAuthorizationParams } from './services/createAuthorization.js'
export { createAuthorization } from './services/createAuthorization.js'
export type { CreateOrderParams } from './services/createOrder.js'
export { createOrder } from './services/createOrder.js'
export type { CreateWithdrawalParams } from './services/createWithdrawal.js'
export { createWithdrawal } from './services/createWithdrawal.js'
export type { GetAccountParams } from './services/getAccount.js'
export { getAccount } from './services/getAccount.js'
export type { GetActivityParams } from './services/getActivity.js'
export { getActivity } from './services/getActivity.js'
export { getDexes } from './services/getDexes.js'
export type { GetHistoryParams } from './services/getHistory.js'
export { getHistory } from './services/getHistory.js'
export type { GetMarketParams } from './services/getMarket.js'
export { getMarket } from './services/getMarket.js'
export type { GetMarketsParams } from './services/getMarkets.js'
export { getMarkets } from './services/getMarkets.js'
export type { GetOhlcvParams } from './services/getOhlcv.js'
export { getOhlcv } from './services/getOhlcv.js'
export type { GetOrderParams } from './services/getOrder.js'
export { getOrder } from './services/getOrder.js'
export type { GetOrderbookParams } from './services/getOrderbook.js'
export { getOrderbook } from './services/getOrderbook.js'
export type { GetPricesParams } from './services/getPrices.js'
export { getPrices } from './services/getPrices.js'
export type { ModifyOrderParams } from './services/modifyOrder.js'
export { modifyOrder } from './services/modifyOrder.js'
export type { SubmitAuthorizationParams } from './services/submitAuthorization.js'
export { submitAuthorization } from './services/submitAuthorization.js'
export type { SubmitOrderParams } from './services/submitOrder.js'
export { submitOrder } from './services/submitOrder.js'
export type { SubmitWithdrawalParams } from './services/submitWithdrawal.js'
export { submitWithdrawal } from './services/submitWithdrawal.js'

// Utils
export type { AccountSummary } from './utils/accountSummary.js'
export { calculateAccountSummary } from './utils/accountSummary.js'
export type { ExpectedPnl } from './utils/calculations.js'
export {
  applySlippage,
  calculateExpectedPnl,
  calculateLiquidationPrice,
  calculateNotionalValue,
  calculatePositionSize,
  calculateRealizedPnlPercent,
  calculateRequiredMargin,
  calculateRoe,
  calculateUnrealizedPnl,
  estimateFees,
  percentFromPrice,
  priceFromPercent,
} from './utils/calculations.js'
export {
  formatOrderPrice,
  formatOrderSize,
  getMaxPriceDecimals,
} from './utils/hyperliquid/index.js'
export { getAsset, getQuoteAsset, getVenue } from './utils/market.js'
export type { FillClassification } from './utils/orderClassification.js'
export {
  classifyFill,
  isStopLossOrder,
  isTakeProfitOrder,
  isTpSlOrder,
} from './utils/orderClassification.js'
export { stringToFloat } from './utils/parse.js'
export { signTypedData } from './utils/signTypedData.js'
export { fromBaseUnits, fromBaseUnitsNumber } from './utils/units.js'
export { validateMargin } from './utils/validation.js'

// Version
export { name, version } from './version.js'
