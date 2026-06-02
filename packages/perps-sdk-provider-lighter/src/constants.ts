/**
 * Lighter provider key as it appears on `Provider.key` from the backend.
 *
 * @public
 */
export const LIGHTER_PROVIDER_KEY = 'lighter'

/**
 * Default mainnet REST base URL for Lighter.
 *
 * @public
 */
export const DEFAULT_LIGHTER_REST_URL = 'https://mainnet.zklighter.elliot.ai'

/** @internal */
export const MAX_CANDLE_LIMIT = 1000
/** @internal */
export const DEFAULT_CANDLE_LIMIT = 100
/** @internal */
export const DEFAULT_OHLCV_LOOKBACK_MS = 24 * 60 * 60 * 1000
/** @internal */
export const MAX_ORDERBOOK_DEPTH = 100
/** @internal */
export const DEFAULT_HISTORY_LIMIT = 50
/** @internal */
export const DEFAULT_TRADES_LIMIT = 50

/**
 * Lighter market market_margin_mode enum mirrored from orderBookDetails.
 *
 * @internal
 */
export enum LtMarginMode {
  CROSS = 0,
  ISOLATED = 1,
}

/**
 * Lighter market statuses.
 *
 * @internal
 */
export const MARKET_STATUS_ACTIVE = 'active'

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
 * CDN base for Lighter token logos. URLs are built as
 * `${LIGHTER_LOGO_BASE_URL}/${logo}.${logo_extension}` using the `logo` and
 * `logo_extension` fields from `/api/v1/tokenlist`.
 *
 * @internal
 */
export const LIGHTER_LOGO_BASE_URL = 'https://assets.lighter.xyz/fe/token'

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

export {
  LIGHTER_CODE_ACCOUNT_NOT_FOUND,
  LIGHTER_INVALID_AUTH_CODE,
  LIGHTER_SUCCESS_CODES,
}
