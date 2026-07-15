/**
 * Envelope wrapping every Ondo REST response: `result` is present on
 * success, `error`/`error_code` on failure.
 *
 * @public
 */
export interface OndoGenericResponse<T> {
  success: boolean
  error?: string
  /** Machine-readable failure discriminator (per-endpoint enum). */
  error_code?: string
  result?: T
}

/**
 * Ondo session credential returned by `complete_challenge`. `token` is the
 * JWT presented as `Authorization: Bearer` on subsequent calls.
 *
 * @public
 */
export interface OndoAuthToken {
  identifier: string
  authType: string
  accountId: string
  /** Absolute unix timestamp (seconds). */
  issuedAtSecs: number
  /** Absolute unix timestamp (seconds) — not a duration. */
  expirationSecs: number
  token: string
  /** True when this login created the Ondo account. */
  newAccount: boolean
}

/**
 * An Ondo trading API key, as returned by `POST /v1/api_keys` and persisted
 * client-side. `apiSecret` is the HMAC key returned only at creation, so the
 * whole record is stored immediately and never re-fetched.
 *
 * @public
 */
export interface OndoApiKey {
  keyId: string
  /** HMAC secret; returned only at creation and kept strictly userland. */
  apiSecret: string
  name: string
  /** ISO-8601 creation timestamp, as returned by the venue. */
  createdAt: string
  scopes: string[]
}
