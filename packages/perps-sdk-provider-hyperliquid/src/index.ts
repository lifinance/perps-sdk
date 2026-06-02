// biome-ignore-all lint/performance/noBarrelFile: package public entry point.
// biome-ignore-all lint/performance/noReExportAll: package public entry point.

/**
 * Hyperliquid provider plugin for `@lifi/perps-sdk`. Reads account-specific
 * state directly from `${apiUrl}/info`; enriched asset metadata and
 * public/shared data come from the LI.FI backend. Register the
 * `hyperliquidProvider()` factory with `createPerpsClient`.
 *
 * @packageDocumentation
 * @public
 */

export { projectHyperliquidConfigSettings } from './accountConfig.js'
export { summarizeHyperliquidAccount } from './accountSummary.js'
export {
  DEFAULT_HYPERLIQUID_API_URL,
  HYPERLIQUID_FEE_TIER_FALLBACK,
  PROVIDER_KEY as HYPERLIQUID_PROVIDER_KEY,
} from './constants.js'
export {
  type HyperliquidProviderOptions,
  hyperliquidProvider,
} from './HyperliquidProvider.js'

export type { GetAccountParams } from './services/getAccount.js'
export { getAccount } from './services/getAccount.js'
export type { GetActivityParams } from './services/getActivity.js'
export { getActivity } from './services/getActivity.js'
export type { GetFillsParams } from './services/getFills.js'
export { getFills } from './services/getFills.js'
export type { GetOrderParams } from './services/getOrder.js'
export { getOrder } from './services/getOrder.js'
export type { GetOrdersParams } from './services/getOrders.js'
export { getOrders } from './services/getOrders.js'
export type { GetPositionsParams } from './services/getPositions.js'
export { getPositions } from './services/getPositions.js'
export * from './types/index.js'
export * from './utils/index.js'
export {
  HyperliquidWsProvider,
  hyperliquidWsProvider,
} from './websocket/HyperliquidWsProvider.js'
