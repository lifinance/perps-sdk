// biome-ignore-all lint/performance/noBarrelFile: package public entry point.
// biome-ignore-all lint/performance/noReExportAll: package public entry point.

// ---------------------------------------------------------------------------
// @lifi/perps-sdk-provider-lighter
//
// Lighter provider plugin for @lifi/perps-sdk. Implements `PerpsProvider`
// reads (account / positions / orders / order / fills / activity / assets /
// asset / prices / ohlcv / orderbook) by talking directly to Lighter's REST
// API — no LI.FI backend hop. Auth-gated reads use the user's Lighter
// read-only token (pre-minted, persisted, or minted on-demand via the
// bundled WASM signer).
//
// `signActions` (the `WASM_BLOB` / `EVM_TX` arms of `PerpsClient.execute`)
// is owned here too — `LighterSigner`, `LighterKeyStore`,
// `LighterReadOnlyTokenManager`, and the WASM blob ship with this package.
// ---------------------------------------------------------------------------

export { projectLighterConfigSettings } from './accountConfig.js'
export { summarizeLighterAccount } from './accountSummary.js'
export {
  DEFAULT_API_KEY_INDEX,
  DEFAULT_LIGHTER_REST_URL,
  LIGHTER_PROVIDER_KEY,
} from './constants.js'
export type {
  LighterPerpsProvider,
  LighterProviderOptions,
} from './LighterProvider.js'
export { Lighter, lighterProvider } from './LighterProvider.js'
export * from './mappers/index.js'
export * from './signers/index.js'
export * from './types/index.js'
export * from './utils/index.js'
export type { LighterAuthProvider } from './websocket/LighterWsProvider.js'
export {
  LighterWsProvider,
  type LighterWsProviderOptions,
  lighterWsProvider,
} from './websocket/LighterWsProvider.js'
