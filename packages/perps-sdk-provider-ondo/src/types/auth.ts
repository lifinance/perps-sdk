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
