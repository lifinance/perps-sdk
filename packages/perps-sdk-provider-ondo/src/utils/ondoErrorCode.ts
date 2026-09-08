import { PerpsErrorCode } from '@lifi/perps-types'

/** Ondo envelope `error_code` values that name a rejection a `PerpsErrorCode` describes. */
const ONDO_BODY_ERROR_CODES: ReadonlyMap<string, PerpsErrorCode> = new Map([
  ['insufficient_margin', PerpsErrorCode.InsufficientMargin],
  ['clientOrderID_collision', PerpsErrorCode.NonceAlreadyUsed],
])

/**
 * Maps an Ondo envelope `error_code` to the `PerpsErrorCode` it names. Returns
 * `undefined` for every other code so the status-driven layer decides.
 */
export const ondoErrorCodeFromBody = (
  errorCode: string | undefined
): PerpsErrorCode | undefined =>
  errorCode === undefined ? undefined : ONDO_BODY_ERROR_CODES.get(errorCode)
