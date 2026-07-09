// biome-ignore-all lint/performance/noBarrelFile: package public entry point.
// biome-ignore-all lint/performance/noReExportAll: package public entry point.

/**
 * Lighter provider plugin for `@lifi/perps-sdk`. Serves `PerpsProvider` reads
 * directly from Lighter's REST API (no LI.FI backend hop); auth-gated reads
 * use the user's Lighter read-only token. Also owns `signActions` (the
 * `WASM_BLOB` / `EVM_TX` arms of `PerpsClient.execute`) — `LighterSigner`,
 * `LighterKeyStore`, `LighterReadOnlyTokenManager`, and the WASM blob ship
 * with this package.
 *
 * @packageDocumentation
 * @public
 */

export { projectLighterConfigSettings } from './accountConfig.js'
export { getAccountSummary } from './accountSummary.js'
export {
  DEFAULT_API_KEY_INDEX,
  DEFAULT_LIGHTER_REST_URL,
  LIGHTER_PROVIDER_KEY,
  LIGHTER_SPOT_CATEGORY_ID,
} from './constants.js'
export type {
  LighterPerpsProvider,
  LighterProviderOptions,
} from './LighterProvider.js'
export { Lighter, lighterProvider } from './LighterProvider.js'

export * from './signers/index.js'
export * from './types/index.js'
export * from './utils/index.js'
export type { LighterAuthProvider } from './websocket/LighterWsProvider.js'
export {
  LighterWsProvider,
  type LighterWsProviderOptions,
  lighterWsProvider,
} from './websocket/LighterWsProvider.js'
