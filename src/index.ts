// Client

// Types
export * from '@lifi/perps-types'
// Utils
// biome-ignore lint/correctness/useImportExtensions: package subpath export
export { HlAbstractionMode } from '@lifi/perps-types/providers/hyperliquid'
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
  CancelOrdersParams,
  CheckPrerequisitesParams,
  ExecutePrerequisitesParams,
  ExecutePrerequisitesResult,
  GetPrerequisitesParams,
  HyperliquidConfig,
  ModifyOrdersParams,
  PerpsClientOptions,
  PlaceOrderParams as ClientPlaceOrderParams,
  PlaceTriggerOrderParams as ClientPlaceTriggerOrderParams,
  PrerequisitesResult,
  ProviderConfig,
  ProviderConfigs,
} from './client/types.js'
export { SigningMode } from './client/types.js'
// Errors
export { PerpsErrorMessage } from './errors/constants.js'
export { PerpsError } from './errors/PerpsError.js'
// Realtime
export { PerpsWsClient } from './realtime/PerpsWsClient.js'
export type { EventForSubscription } from './realtime/types.js'
// Services
export type { CreateActionParams } from './services/createAction.js'
export { createAction } from './services/createAction.js'
export type { ExecuteActionParams } from './services/executeAction.js'
export { executeAction } from './services/executeAction.js'
export type { GetAccountParams } from './services/getAccount.js'
export { getAccount } from './services/getAccount.js'
export type { GetActivityParams } from './services/getActivity.js'
export { getActivity } from './services/getActivity.js'
export type { GetAssetParams } from './services/getAsset.js'
export { getAsset } from './services/getAsset.js'
export type { GetAssetsParams } from './services/getAssets.js'
export { getAssets } from './services/getAssets.js'
export type { GetFillsParams } from './services/getFills.js'
export { getFills } from './services/getFills.js'
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
export type { GetPricesParams } from './services/getPrices.js'
export { getPrices } from './services/getPrices.js'
export { getProviders } from './services/getProviders.js'
// Signers
export type {
  ApiKeyPair,
  ChangePubKeyResult,
  LighterApiKey,
  LighterSignedBlob,
  LighterSignerConfig,
  LighterSignerContext,
  LighterWasmExports,
  LoadLighterWasmOptions,
} from './signers/lighter/index.js'
export {
  DEFAULT_API_KEY_INDEX,
  LIGHTER_PROVIDER_KEY,
  LighterKeyStore,
  LighterSigner,
  loadLighterWasm,
  resetLighterWasmCache,
} from './signers/lighter/index.js'
export type { AccountSummary } from './utils/accountSummary.js'
export { calculateAccountSummary } from './utils/accountSummary.js'
export type { ExpectedPnl } from './utils/calculations.js'
export {
  applySlippage,
  calculateExpectedPnl,
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
  calculateLiquidationPrice,
  calculateMaintenanceMarginRate,
  formatOrderPrice,
  formatOrderSize,
  getMaxPriceDecimals,
} from './utils/hyperliquid/index.js'
export {
  classifyFill,
  FillClassification,
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
  predictAverageEntryPrice,
  predictNewLeverage,
  predictUnrealizedPnl,
  realizedPnlOnClose,
} from './utils/positionMath.js'
export { signTypedData } from './utils/signTypedData.js'
export { fromBaseUnits, fromBaseUnitsNumber } from './utils/units.js'
export { validateMargin } from './utils/validation.js'

// Version
export { name, version } from './version.js'
