// biome-ignore-all lint/performance/noBarrelFile: package public entry point.
// biome-ignore-all lint/performance/noReExportAll: package public entry point.

/**
 * `@lifi/perps-sdk` — the public entry point. Exports `createPerpsClient` and
 * `PerpsClient` (the primary API), the WebSocket `PerpsWsClient`, the pure
 * calculation/parsing/order helpers, and re-exports the shared `@lifi/perps-types`.
 *
 * @packageDocumentation
 * @public
 */

export * from '@lifi/perps-types'
export {
  createPerpsClient,
  DEFAULT_API_URL,
} from './client/createPerpsClient.js'
export { PerpsClient } from './client/PerpsClient.js'
export { PerpsErrorMessage } from './errors/constants.js'
export { PerpsError } from './errors/PerpsError.js'
// Registries
export { AssetRegistry, getAssetRegistry } from './registry/assetRegistry.js'
export {
  getMarketRegistry,
  isActiveMarket,
  MarketRegistry,
  toMarketDisplay,
  toPerpsMarketDisplay,
} from './registry/marketRegistry.js'
// Services
export type { CreateActionParams } from './services/createAction.js'
export { createAction } from './services/createAction.js'
export type { ExecuteActionParams } from './services/executeAction.js'
export { executeAction } from './services/executeAction.js'
export type { GetAccountParams } from './services/getAccount.js'
export { getAccount } from './services/getAccount.js'
export type { GetActivityParams } from './services/getActivity.js'
export { getActivity } from './services/getActivity.js'
export type { GetAssetsParams } from './services/getAssets.js'
export { getAssets } from './services/getAssets.js'
export type { GetFillsParams } from './services/getFills.js'
export { getFills } from './services/getFills.js'
export type { GetGasRecommendationParams } from './services/getGasRecommendation.js'
export {
  getGasRecommendation,
  LIFI_API_URL,
} from './services/getGasRecommendation.js'
export type { GetMarketParams } from './services/getMarket.js'
export { getMarket } from './services/getMarket.js'
export type { GetMarketsParams } from './services/getMarkets.js'
export { getMarkets } from './services/getMarkets.js'
export type { GetMarketsContextParams } from './services/getMarketsContext.js'
export { getMarketsContext } from './services/getMarketsContext.js'
export { getMeta } from './services/getMeta.js'
export type { GetOhlcvParams } from './services/getOhlcv.js'
export { getOhlcv } from './services/getOhlcv.js'
export type { GetOrderParams } from './services/getOrder.js'
export { getOrder } from './services/getOrder.js'
export type { GetOrderbookParams } from './services/getOrderbook.js'
export { getOrderbook } from './services/getOrderbook.js'
export type { GetOrdersParams } from './services/getOrders.js'
export { getOrders } from './services/getOrders.js'
export type { GetPositionsParams } from './services/getPositions.js'
export { getPositions } from './services/getPositions.js'
export { getProviders } from './services/getProviders.js'
export type { GetQuoteParams } from './services/getQuote.js'
export { getQuote } from './services/getQuote.js'
export type { GetReferralActivityParams } from './services/getReferralActivity.js'
export { getReferralActivity } from './services/getReferralActivity.js'
export type { GetReferralStatusParams } from './services/getReferralStatus.js'
export { getReferralStatus } from './services/getReferralStatus.js'
export { getTermsAcceptance } from './services/getTermsAcceptance.js'
export { resolveQuote, resolveQuoteMarket } from './services/resolveQuote.js'
export {
  QUOTE_THROTTLE_MS,
  resolveSubscribeQuote,
} from './services/resolveSubscribeQuote.js'
export { localStorageAdapter } from './storage/encryptedStorage.js'
export {
  parseStoredRecord,
  readValidatedRecord,
} from './storage/parseStoredRecord.js'
export { createMemoryStorage } from './storage/storage.js'
export type { StorageAdapter } from './storage/types.js'
export type { FetchWithRetryOptions } from './transport/fetchWithRetry.js'
export { fetchWithRetry } from './transport/fetchWithRetry.js'
export type {
  ProviderRetryConfig,
  ResolvedRetryPolicy,
  RetryAttemptContext,
  RetryClassification,
  RetryClassifyContext,
  RetryConfig,
  RetryPolicy,
} from './transport/retryPolicy.js'
export {
  DISABLED_RETRY,
  LIFI_REQUEST_KEY,
  LIFI_RETRY_DEFAULTS,
  resolveRetryPolicy,
} from './transport/retryPolicy.js'
export type {
  BuildProviderSetupParams,
  CancelOrdersParams,
  CancelTwapOrderParams as ClientCancelTwapOrderParams,
  CreateReferralCodeActionParams,
  ExecuteMetaActionParams,
  GetAccountResult,
  GetDepositFlowParams,
  GetSetupParams,
  GetWithdrawableBalancesParams,
  ModifyOrdersParams,
  PerpsClientOptions,
  PerpsConfig,
  PlaceOrderParams as ClientPlaceOrderParams,
  PlaceTriggerOrderParams as ClientPlaceTriggerOrderParams,
  PlaceTwapOrderParams as ClientPlaceTwapOrderParams,
  ProviderSetup,
  SendAssetActionParams,
  SubmitOnboardingParams,
  WithdrawParams,
} from './types/api.js'
export type {
  HyperliquidConfig,
  PerpsBaseConfig,
  PerpsClientSigner,
  ProviderConfig,
  ProviderConfigs,
  RequestInterceptor,
  SDKRequestOptions,
  SwitchChainHook,
} from './types/config.js'
export type {
  DeclaredDepositAsset,
  DepositFlow,
  DepositFlowFirstDepositPipeline,
  DepositFlowLifiSwap,
  DepositFlowSetupRequired,
} from './types/deposit.js'
export type {
  ActionSignerContribution,
  LiquidationEstimateParams,
  PerpsProvider,
  PerpsProviderPlugin,
  PerpsSDKClient,
  ProviderAccountExistsParams,
  ProviderGetAccountParams,
  ProviderGetActivityParams,
  ProviderGetDepositFlowParams,
  ProviderGetFillsParams,
  ProviderGetMarketSettingsParams,
  ProviderGetOrderParams,
  ProviderGetOrdersParams,
  ProviderGetPositionsParams,
  ProviderGetQuoteParams,
  ProviderGetRunningTwapsParams,
  ProviderGetWithdrawableBalancesParams,
  QuoteListener,
  SignActionProgress,
  SignActionsContext,
} from './types/provider.js'
export type {
  ProviderWithdrawableBalance,
  WithdrawableBalance,
  WithdrawalRoute,
} from './types/withdrawal.js'
export {
  type CollateralSemantics,
  summarizeAccount,
} from './utils/accountSummary.js'
export { paginateActivity } from './utils/activityPaging.js'
export type { ExpectedPnl } from './utils/calculations.js'
export {
  applySlippage,
  buildQuote,
  calculateExpectedPnl,
  calculateNotionalValue,
  calculatePositionSize,
  calculateRealizedPnlPercent,
  calculateRequiredMargin,
  calculateRoe,
  calculateUnrealizedPnl,
  effectiveLeverage,
  estimateFees,
  liquidationDistancePercent,
  percentFromPrice,
  priceFromPercent,
  walkOrderbook,
} from './utils/calculations.js'
export {
  ETHEREUM_NATIVE_GAS,
  ETHEREUM_USDC,
  HYPERLIQUID_USDC,
  LIGHTER_USDC,
  ROBINHOOD_NATIVE_GAS,
  ROBINHOOD_USDG,
} from './utils/depositAssets.js'
export {
  ExplorerChainId,
  explorerTxUrl,
  explorerTxUrlFromBase,
} from './utils/explorer.js'
export { classifyFillFromPosition } from './utils/fillClassification.js'
export type { FormatOptions, RoundingMode } from './utils/format.js'
export {
  formatCompactUsd,
  formatNumber,
  formatPrice,
  formatSignedPercent,
  formatSignedUsd,
  formatUsd,
} from './utils/format.js'
export {
  ACTIVE_ORDER_STATUSES,
  classifyFill,
  FillClassification,
  isActiveOrderStatus,
  isStopLossOrder,
  isTakeProfitOrder,
  isTpSlOrder,
} from './utils/orderClassification.js'
export {
  expectedRealizedPnlForOpenOrder,
  expectedRealizedPnlForTriggerOrder,
  findMatchingPosition,
  resolveCloseSize,
} from './utils/orderMath.js'
export { stringToFloat } from './utils/parse.js'
export {
  directionSign,
  estimateIsolatedLiquidationPrice,
  predictAverageEntryPrice,
  predictNewLeverage,
  predictUnrealizedPnl,
  realizedPnlOnClose,
} from './utils/positionMath.js'
export type { ScaleToIntegerPolicy } from './utils/scaleToInteger.js'
export { scaleToInteger } from './utils/scaleToInteger.js'
export { selectUserSetupActions } from './utils/setupActions.js'
export {
  signTypedData,
  signTypedDataWithSigner,
} from './utils/signTypedData.js'
export type { RemovableIsolatedMarginParams } from './utils/transferMargin.js'
export { removableIsolatedMargin } from './utils/transferMargin.js'
export { fromBaseUnits, fromBaseUnitsNumber } from './utils/units.js'
export { validateMargin } from './utils/validation.js'
// Version
export { name, version } from './version.js'
export { cachePromise } from './websocket/cachePromise.js'
export type {
  PerpsWsClientOptions,
  WsProviderFactory,
} from './websocket/PerpsWsClient.js'
export { PerpsWsClient } from './websocket/PerpsWsClient.js'
export type { ReconnectingWebSocketOptions } from './websocket/ReconnectingWebSocket.js'
export { ReconnectingWebSocket } from './websocket/ReconnectingWebSocket.js'
export type {
  EventForSubscription,
  SubscriptionListener,
  WsConnectionStatus,
  WsProvider,
  WsStatusListener,
} from './websocket/types.js'
export {
  WS_CHANNEL_TEARDOWN_LINGER_MS,
  WsProviderBase,
} from './websocket/WsProviderBase.js'
export { wsLog } from './websocket/wsLog.js'
