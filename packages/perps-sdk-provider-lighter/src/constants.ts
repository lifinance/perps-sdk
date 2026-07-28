import type { FeeTier, LighterProviderKey } from '@lifi/perps-types'

/**
 * Lighter provider key as it appears on `Provider.key` from the backend.
 *
 * @public
 */
export const LIGHTER_PROVIDER_KEY = 'lighter'

/**
 * Category id for Lighter spot token holdings, matching the backend's Lighter
 * spot asset category. The perps category id is not a constant — it is read
 * from the fetched markets so it tracks the backend taxonomy.
 *
 * @public
 */
export const LIGHTER_SPOT_CATEGORY_ID = 'spot'

/**
 * Default mainnet REST and WS base URL for Lighter.
 *
 * @public
 */
export const DEFAULT_LIGHTER_REST_URL = 'https://mainnet.zklighter.elliot.ai'
/**
 * Default mainnet WebSocket stream URL for Lighter.
 *
 * @public
 */
export const DEFAULT_LIGHTER_WS_URL = 'wss://mainnet.zklighter.elliot.ai/stream'

/**
 * zkLighter L2 signing chain id fed to {@link LighterSigner} on mainnet.
 *
 * @public
 */
export const DEFAULT_LIGHTER_SIGNER_CHAIN_ID = 304

/**
 * Base URL the mainnet Lighter zkLighter explorer resolves a tx hash against
 * (`${base}${txHash}`).
 *
 * @public
 */
export const DEFAULT_LIGHTER_EXPLORER_TX_BASE_URL =
  'https://app.lighter.xyz/explorer/logs/'

/**
 * The venue-specific facts that distinguish one Lighter deployment from
 * another. One provider + WS pair is built per instance from these; a client
 * may register several so long as their `providerKey`s differ.
 *
 * @public
 */
export interface LighterInstanceConfig {
  /** Wire-visible `Provider.key` and the plugin `type`; unique per instance. */
  providerKey: LighterProviderKey
  restUrl: string
  wsUrl: string
  /**
   * zkLighter L2 signing chain id to construct this instance's
   * {@link LighterSigner} with.
   */
  signerChainId: number
  /**
   * Explorer tx base URL for transfer-activity links (`${base}${txHash}`).
   * When omitted, transfer links are not emitted for this instance.
   */
  explorerTxBaseUrl?: string
}

/**
 * The built-in mainnet Lighter instance — the defaults `lighterProvider()` and
 * `lighterWsProvider()` apply when constructed with no instance overrides.
 *
 * @public
 */
export const LIGHTER_MAINNET_INSTANCE: LighterInstanceConfig = {
  providerKey: LIGHTER_PROVIDER_KEY,
  restUrl: DEFAULT_LIGHTER_REST_URL,
  wsUrl: DEFAULT_LIGHTER_WS_URL,
  signerChainId: DEFAULT_LIGHTER_SIGNER_CHAIN_ID,
  explorerTxBaseUrl: DEFAULT_LIGHTER_EXPLORER_TX_BASE_URL,
}

/**
 * Provider key for the Lighter instance running on Robinhood chain.
 *
 * @public
 */
export const LIGHTER_RH_PROVIDER_KEY = 'lighter-rh'

/**
 * Default REST base URL for the Lighter Robinhood deployment.
 *
 * @public
 */
export const LIGHTER_RH_REST_URL = 'https://api.rh.lighter.xyz'
/**
 * Default WebSocket URL for the Lighter Robinhood deployment.
 *
 * @public
 */
export const LIGHTER_RH_WS_URL = 'wss://api.rh.lighter.xyz/stream'

/**
 * Deployment-supplied facts the RH instance cannot source from public
 * documentation and the caller must confirm.
 *
 * @public
 */
export interface LighterRhInstanceOverrides {
  /**
   * zkLighter L2 signing chain id for the RH instance. Unverified from public
   * sources — must be the value confirmed against lighter-go / RH support, not
   * mainnet's 304 nor the RH L1 chain id 4663.
   */
  signerChainId: number
  /**
   * RH zkLighter explorer tx base URL. Omit until confirmed; transfer links are
   * then left unset rather than pointed at the mainnet explorer.
   */
  explorerTxBaseUrl?: string
}

/**
 * Build the `lighter-rh` {@link LighterInstanceConfig}. The signing chain id is
 * a required argument because it is not verifiable from public sources — the
 * caller must pass the value confirmed against lighter-go / RH support.
 *
 * @public
 */
export const lighterRhInstance = (
  overrides: LighterRhInstanceOverrides
): LighterInstanceConfig => ({
  providerKey: LIGHTER_RH_PROVIDER_KEY,
  restUrl: LIGHTER_RH_REST_URL,
  wsUrl: LIGHTER_RH_WS_URL,
  signerChainId: overrides.signerChainId,
  explorerTxBaseUrl: overrides.explorerTxBaseUrl,
})

/** @internal */
export const DEFAULT_TRADES_LIMIT = 50

/**
 * Lighter pairs each maker/taker fee with a 1e6 integer tick:
 *   fee_fraction = current_*_fee_tick / 1_000_000
 *
 * See lighter-python `paper_client/types.py:_FEE_TICK` for the canonical scale.
 *
 * @internal
 */
export const LIGHTER_FEE_TICK_SCALE = 1_000_000

/**
 * Lighter's public base fee tier (Standard Account): 0% maker / 0% taker on all
 * perps markets. Per-account Premium tiers exist but require auth to resolve;
 * unauthenticated quotes use this public base. Fractions, not basis points.
 *
 * @public
 */
export const LIGHTER_BASE_FEE_TIER: FeeTier = { maker: '0', taker: '0' }

/**
 * Wildcard `market_id` accepted by Lighter's per-market account endpoints to
 * indicate "every market". Used on `accountInactiveOrders`, `positionFunding`,
 * `liquidations`.
 *
 * @internal
 */
export const LIGHTER_ALL_MARKETS_WILDCARD = 255

/**
 * Lighter caps `limit` at 100 on positionFunding/liquidations endpoints.
 *
 * @internal
 */
export const LIGHTER_HISTORY_PAGE_SIZE = 100

/**
 * Default API key slot — reused per account. Lighter's docs reserve indexes
 * `{0,1,2,3}` for its own desktop/mobile interfaces; user keys start at 4
 * (max 254, with 255 reserved as `NilApiKeyIndex`). 42 is the LI.FI-wide
 * identifier so a user running both the Lighter app and the widget never
 * collides with the app's session key.
 *
 * @public
 */
export const DEFAULT_API_KEY_INDEX = 42

/** @internal */
const LIGHTER_CODE_ACCOUNT_NOT_FOUND = 21100

/**
 * Lighter body `code` for a rejected/invalid auth token ("invalid auth string").
 *
 * @internal
 */
const LIGHTER_INVALID_AUTH_CODE = 20013

/**
 * Lighter body `code` values that mean success. Lighter is inconsistent per
 * endpoint: `/api/v1/account` returns `code: 200`, most others return `code: 0`.
 * A body with no `code` field is also success (no error channel present).
 *
 * @internal
 */
const LIGHTER_SUCCESS_CODES = new Set([0, 200])

/**
 * Lighter body `code` meaning "operation succeeded" on the non-`/sendTx`
 * mutation endpoints (`/changeAccountTier`, `/referral/use`). Any other code is
 * a business-rule rejection surfaced verbatim to the caller.
 *
 * @internal
 */
const LIGHTER_MUTATION_SUCCESS_CODE = 200

export {
  LIGHTER_CODE_ACCOUNT_NOT_FOUND,
  LIGHTER_INVALID_AUTH_CODE,
  LIGHTER_MUTATION_SUCCESS_CODE,
  LIGHTER_SUCCESS_CODES,
}
