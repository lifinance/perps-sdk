import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { ondoErrorCodeFromBody } from './ondoErrorCode.js'

describe('ondoErrorCodeFromBody', () => {
  it.each<[string, PerpsErrorCode]>([
    ['insufficient_margin', PerpsErrorCode.InsufficientMargin],
    ['clientOrderID_collision', PerpsErrorCode.NonceAlreadyUsed],
  ])('maps error_code %s to PerpsErrorCode %i', (errorCode, code) => {
    expect(ondoErrorCodeFromBody(errorCode)).toBe(code)
  })

  it.each([
    undefined,
    'post_only_has_match',
    'api_key_not_found',
    'INSUFFICIENT_MARGIN',
  ])('returns undefined for %s', (errorCode) => {
    expect(ondoErrorCodeFromBody(errorCode)).toBeUndefined()
  })
})
