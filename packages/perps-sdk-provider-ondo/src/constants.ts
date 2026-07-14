/**
 * Ondo provider key as it appears on `Provider.key` from the backend.
 *
 * @public
 */
export const ONDO_PROVIDER_KEY = 'ondo'

/**
 * Default (production) REST base URL for Ondo Perps.
 *
 * @public
 */
export const DEFAULT_ONDO_API_URL = 'https://api.ondoperps.xyz'

/**
 * Sandbox REST base URL for Ondo Perps.
 *
 * @public
 */
export const ONDO_SANDBOX_API_URL = 'https://api.ondoperps-sandbox.xyz'

/**
 * Default (production) WebSocket URL for Ondo Perps.
 *
 * @public
 */
export const DEFAULT_ONDO_WS_URL = 'wss://api.ondoperps.xyz/ws'

/**
 * Ondo's public base fee schedule (2 bps maker / 5 bps taker). Ondo exposes no
 * per-account fee endpoint, so quotes and account snapshots use this schedule.
 *
 * @public
 */
export const ONDO_BASE_FEE_TIER = {
  maker: '0.0002',
  taker: '0.0005',
}

/**
 * Name applied to the trading API key the SDK mints on first trading use.
 *
 * @public
 */
export const ONDO_API_KEY_NAME = 'lifi-perps'

/**
 * Scopes requested when minting the trading API key.
 *
 * @public
 */
export const ONDO_API_KEY_SCOPES = ['trade']

/**
 * Terms-of-Service version accepted at first login. Venue-owned; current value.
 *
 * @public
 */
export const ONDO_TERMS_VERSION = 1

/**
 * Privacy-policy version accepted at first login. Venue-owned; current value.
 *
 * @public
 */
export const ONDO_PRIVACY_VERSION = 1
