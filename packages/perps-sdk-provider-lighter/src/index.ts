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
export { summarizeLighterAccount } from './accountSummary.js'
// Provider plugin + factory
export type {
  LighterPerpsProvider,
  LighterProviderOptions,
} from './provider/LighterProvider.js'
export { Lighter, lighterProvider } from './provider/LighterProvider.js'
export { LighterMarketRegistry } from './provider/markets.js'
// Realtime WS provider
export type { LighterAuthProvider } from './realtime/LighterWsProvider.js'
export {
  LighterWsProvider,
  type LighterWsProviderOptions,
  lighterWsProvider,
} from './realtime/LighterWsProvider.js'
// Signers + Lighter-owned standalone utilities
export type {
  ApiKeyPair,
  ApproveReadOnlyTokenInputs,
  ApproveReadOnlyTokenResult,
  ChangePubKeyResult,
  CreateAuthTokenInputs,
  LighterApiKey,
  LighterCreateTokenResponse,
  LighterReadOnlyToken,
  LighterReadOnlyTokenManagerOptions,
  LighterSignedBlob,
  LighterSignerConfig,
  LighterSignerContext,
  LighterTokenFetcher,
  LighterWalletSigner,
  LighterWasmExports,
  LoadLighterWasmOptions,
} from './signers/index.js'
export {
  buildReadOnlyTokenMessage,
  createAuthToken,
  DEFAULT_LIGHTER_API_URL,
  DEFAULT_READ_ONLY_TOKEN_NAME,
  defaultLighterTokenFetcher,
  isReadOnlyTokenExpiringSoon,
  LighterKeyStore,
  LighterReadOnlyTokenManager,
  LighterSigner,
  loadLighterWasm,
  resetLighterWasmCache,
  walletClientSigner,
} from './signers/index.js'
