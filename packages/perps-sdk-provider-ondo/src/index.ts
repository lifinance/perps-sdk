// biome-ignore-all lint/performance/noBarrelFile: package public entry point.
// biome-ignore-all lint/performance/noReExportAll: package public entry point.

/**
 * Ondo Perps provider plugin for `@lifi/perps-sdk`. Ondo authenticates with a
 * client-held session JWT obtained through a SIWE (ERC-4361) login — this
 * package owns the venue HTTP boundary (`OndoApiClient`), the login completion
 * (`completeSiweLogin`), and browser-side persistence of the session token
 * (`OndoTokenStore`). The JWT never transits the LI.FI backend.
 *
 * @packageDocumentation
 * @public
 */

export { projectOndoConfigSettings } from './accountConfig.js'
export { getAccountSummary } from './accountSummary.js'
export * from './auth/index.js'
export {
  DEFAULT_ONDO_API_URL,
  DEFAULT_ONDO_WS_URL,
  ONDO_BASE_FEE_TIER,
  ONDO_PROVIDER_KEY,
  ONDO_SANDBOX_API_URL,
} from './constants.js'
export {
  Ondo,
  type OndoProviderOptions,
  ondoProvider,
} from './OndoProvider.js'
export * from './types/index.js'
export * from './utils/index.js'
export {
  OndoWsProvider,
  type OndoWsProviderOptions,
  ondoWsProvider,
} from './websocket/OndoWsProvider.js'
