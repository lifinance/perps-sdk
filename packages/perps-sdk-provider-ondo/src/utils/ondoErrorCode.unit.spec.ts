import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { ondoErrorFromBody } from './ondoErrorCode.js'

describe('ondoErrorFromBody', () => {
  it.each<[string, PerpsErrorCode]>([
    ['insufficient_margin', PerpsErrorCode.InsufficientMargin],
    ['clientOrderID_collision', PerpsErrorCode.NonceAlreadyUsed],
  ])('maps error_code %s to PerpsErrorCode %i', (errorCode, code) => {
    expect(ondoErrorFromBody(errorCode)).toEqual({ code })
  })

  it.each<[string, PerpsErrorCode, string]>([
    [
      'bad_label',
      PerpsErrorCode.ValidationError,
      'Ondo rejected the withdrawal address label.',
    ],
    [
      'empty_label',
      PerpsErrorCode.ValidationError,
      'Ondo requires a withdrawal address label.',
    ],
    [
      'bad_withdrawal_address',
      PerpsErrorCode.ValidationError,
      'Ondo rejected the withdrawal address as not valid.',
    ],
    [
      'internal_withdrawal_address',
      PerpsErrorCode.ValidationError,
      'Ondo does not accept an Ondo deposit address as a withdrawal address.',
    ],
    [
      'challenge_not_found',
      PerpsErrorCode.NonceExpired,
      'The Ondo address book challenge is unknown or expired. Request a new challenge.',
    ],
    [
      'withdrawal_address_not_found',
      PerpsErrorCode.SetupRequired,
      'The withdrawal destination is not in the Ondo address book. Add the withdrawal address first.',
    ],
  ])('maps address book error_code %s to PerpsErrorCode %i with a clear message', (errorCode, code, message) => {
    expect(ondoErrorFromBody(errorCode)).toEqual({ code, message })
  })

  it.each([
    undefined,
    'post_only_has_match',
    'api_key_not_found',
    'INSUFFICIENT_MARGIN',
  ])('returns undefined for %s', (errorCode) => {
    expect(ondoErrorFromBody(errorCode)).toBeUndefined()
  })
})
