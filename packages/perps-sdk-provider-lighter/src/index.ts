// ---------------------------------------------------------------------------
// @lifi/perps-sdk-provider-lighter
//
// Lighter provider plugin for @lifi/perps-sdk. Implements `PerpsProvider`
// reads (account / positions / orders / order / fills / activity / assets /
// asset / prices / ohlcv / orderbook) by talking directly to Lighter's REST
// API — no LI.FI backend hop. Auth-gated reads use the user's Lighter
// read-only token (pre-minted or minted on-demand via the bundled WASM
// signer).
//
// Companion pieces (`LighterSigner`, `LighterKeyStore`,
// `LighterReadOnlyTokenManager`, `LighterWsProvider`) currently live in
// `@lifi/perps-sdk` and are re-exported here for one-stop consumption of the
// Lighter integration. Re-exports avoid duplication; the canonical move into
// this package is tracked as a follow-up restructure.
// ---------------------------------------------------------------------------

// Activity cursor envelope (preserves the backend-emitted shape)
export type { LighterActivityCursor } from './provider/activityCursor.js'
export {
  decodeActivityCursor,
  encodeActivityCursor,
} from './provider/activityCursor.js'
// REST primitives — exported for callers building their own caches
export { LighterApiClient } from './provider/apiClient.js'
// Constants — re-exported for advanced callers
export {
  DEFAULT_API_KEY_INDEX,
  DEFAULT_LIGHTER_REST_URL,
  LIGHTER_PROVIDER_KEY,
} from './provider/constants.js'
// Provider plugin + factory
export type { LighterProviderOptions } from './provider/LighterProvider.js'
export {
  Lighter,
  LighterProvider,
  lighterProvider,
} from './provider/LighterProvider.js'
export { LighterMarketRegistry } from './provider/markets.js'
