import { PerpsErrorCode } from '@lifi/perps-types'

/** Lighter body `code` values that name a rejection a `PerpsErrorCode` describes. */
const LIGHTER_BODY_ERROR_CODES: ReadonlyMap<number, PerpsErrorCode> = new Map([
  // invalid nonce
  [21104, PerpsErrorCode.InvalidNonce],
  // batch transaction nonce is not increasing
  [21105, PerpsErrorCode.InvalidNonce],
  // not enough collateral
  [21301, PerpsErrorCode.InsufficientBalance],
  // not enough asset balance
  [21304, PerpsErrorCode.InsufficientBalance],
  // not enough asset balance for fee
  [21305, PerpsErrorCode.InsufficientBalance],
  // account is below maintenance margin
  [21507, PerpsErrorCode.InsufficientMargin],
  // account is below initial margin
  [21508, PerpsErrorCode.InsufficientMargin],
  // not enough margin to create the order
  [21739, PerpsErrorCode.InsufficientMargin],
])

/**
 * Maps a Lighter body error `code` to the `PerpsErrorCode` it names. Returns
 * `undefined` for every other code so the status-driven layer decides.
 */
export const lighterErrorCodeFromBody = (
  code: number | undefined
): PerpsErrorCode | undefined =>
  code === undefined ? undefined : LIGHTER_BODY_ERROR_CODES.get(code)
