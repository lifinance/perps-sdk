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
  PerpsClientOptions,
  PlaceOrderParams,
  RequiredAuthorizationsResult,
  SigningMode,
} from './client/types.js'
// Dex
export { getDexAuthProvider } from './dex/registry.js'
export type { DexAuthInputs, DexAuthProvider } from './dex/types.js'
export { AgentError } from './errors/AgentError.js'
export { PerpsErrorMessage, PerpsErrorName } from './errors/constants.js'
// Errors
export { HTTPError } from './errors/HTTPError.js'
export { PerpsError } from './errors/PerpsError.js'
export { PerpsSDKError } from './errors/PerpsSDKError.js'
export { ServerError } from './errors/ServerError.js'
export {
  findErrorType,
  getErrorChain,
  getRootCause,
  getRootCauseMessage,
  hasErrorType,
} from './errors/utils/rootCause.js'
export { ValidationError } from './errors/ValidationError.js'
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
export type { SubmitAuthorizationParams } from './services/submitAuthorization.js'
export { submitAuthorization } from './services/submitAuthorization.js'
export type { SubmitOrderParams } from './services/submitOrder.js'
export { submitOrder } from './services/submitOrder.js'
export type { SubmitWithdrawalParams } from './services/submitWithdrawal.js'
export { submitWithdrawal } from './services/submitWithdrawal.js'

// Utils
export { signTypedData } from './utils/signTypedData.js'

// Version
export { name, version } from './version.js'
