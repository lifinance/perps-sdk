// biome-ignore-all lint/performance/noBarrelFile: package public entry point.
// biome-ignore-all lint/performance/noReExportAll: package public entry point.

/**
 * Lighter provider plugin for `@lifi/perps-sdk`. Serves `PerpsProvider` reads
 * directly from Lighter's REST API (no LI.FI backend hop); auth-gated reads
 * use the user's Lighter read-only token. Also owns `signActions` (the
 * `WASM_BLOB` / `EVM_TX` arms of `PerpsClient.execute`): each provider
 * instance creates its own WASM signer, API-key store and read-only token
 * manager, and the Go signer binary ships with this package.
 *
 * @packageDocumentation
 * @public
 */

export { projectLighterConfigSettings } from './accountConfig.js'
export { getAccountSummary } from './accountSummary.js'
export type {
  LighterCollateralAsset,
  LighterDeployment,
} from './constants.js'
export {
  DEFAULT_LIGHTER_EXPLORER_TX_BASE_URL,
  DEFAULT_LIGHTER_REST_URL,
  DEFAULT_LIGHTER_WS_URL,
  LIGHTER_COLLATERAL_ASSETS,
  LIGHTER_MAINNET_DEPLOYMENT,
  LIGHTER_MAINNET_SIGNER_CHAIN_ID,
  LIGHTER_PROVIDER_KEY,
  LIGHTER_RH_DEPLOYMENT,
  LIGHTER_RH_PROVIDER_KEY,
  LIGHTER_RH_REST_URL,
  LIGHTER_RH_SIGNER_CHAIN_ID,
  LIGHTER_RH_WS_URL,
  LIGHTER_SPOT_CATEGORY_ID,
} from './constants.js'
export { lighterDepositFlow } from './depositFlow.js'
export type {
  LighterPerpsProvider,
  LighterProviderOptions,
} from './LighterProvider.js'
export {
  Lighter,
  lighterProvider,
  lighterRhProvider,
} from './LighterProvider.js'
export type { LighterWasmExports } from './signers/wasmLoader.js'
export { loadLighterWasm } from './signers/wasmLoader.js'

export * from './types/index.js'
export * from './utils/index.js'
export type { LighterAuthTokenResolver } from './websocket/LighterWsProvider.js'
export {
  LighterWsProvider,
  type LighterWsProviderOptions,
  lighterWsProvider,
} from './websocket/LighterWsProvider.js'
