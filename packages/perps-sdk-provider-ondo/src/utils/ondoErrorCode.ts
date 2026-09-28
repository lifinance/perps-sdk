import { PerpsErrorCode } from '@lifi/perps-types'

/**
 * The classification of an Ondo envelope `error_code`. `message` replaces the
 * venue's own text when that text does not tell the caller what to do.
 */
export interface OndoBodyError {
  code: PerpsErrorCode
  message?: string
}

/** Ondo envelope `error_code` values that name a rejection a `PerpsErrorCode` describes. */
const ONDO_BODY_ERRORS: ReadonlyMap<string, OndoBodyError> = new Map([
  ['insufficient_margin', { code: PerpsErrorCode.InsufficientMargin }],
  ['clientOrderID_collision', { code: PerpsErrorCode.NonceAlreadyUsed }],
  [
    'bad_label',
    {
      code: PerpsErrorCode.ValidationError,
      message: 'Ondo rejected the withdrawal address label.',
    },
  ],
  [
    'empty_label',
    {
      code: PerpsErrorCode.ValidationError,
      message: 'Ondo requires a withdrawal address label.',
    },
  ],
  [
    'bad_withdrawal_address',
    {
      code: PerpsErrorCode.ValidationError,
      message: 'Ondo rejected the withdrawal address as not valid.',
    },
  ],
  [
    'internal_withdrawal_address',
    {
      code: PerpsErrorCode.ValidationError,
      message:
        'Ondo does not accept an Ondo deposit address as a withdrawal address.',
    },
  ],
  [
    'challenge_not_found',
    {
      code: PerpsErrorCode.NonceExpired,
      message:
        'The Ondo address book challenge is unknown or expired. Request a new challenge.',
    },
  ],
  [
    'withdrawal_address_not_found',
    {
      code: PerpsErrorCode.SetupRequired,
      message:
        'The withdrawal destination is not in the Ondo address book. Add the withdrawal address first.',
    },
  ],
])

/**
 * Classifies an Ondo envelope `error_code`. Returns `undefined` for every other
 * code so the status-driven layer decides.
 */
export const ondoErrorFromBody = (
  errorCode: string | undefined
): OndoBodyError | undefined =>
  errorCode === undefined ? undefined : ONDO_BODY_ERRORS.get(errorCode)
