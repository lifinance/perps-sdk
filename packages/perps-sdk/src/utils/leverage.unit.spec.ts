import { PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VENUE_PROVIDER_ID, venueClient } from '../wire/venueProvider.mock.js'
import { isLeverageEqual, safeIsLeverageEqual } from './leverage.js'

const sdk = venueClient()

describe('isLeverageEqual', () => {
  it.each([
    ['15', '15.00', true],
    ['15', '14.99', false],
    ['15', '15.01', false],
    ['1.0000000000000001', '1', false],
  ])('compares %s with %s exactly without a provider rule', (requested, reported, expected) => {
    expect(isLeverageEqual(sdk, VENUE_PROVIDER_ID, requested, reported)).toBe(
      expected
    )
  })

  it.each([
    '0',
    '-1',
    '',
    'NaN',
    '1e1',
  ])('rejects the invalid leverage %s', (value) => {
    expect(() => isLeverageEqual(sdk, VENUE_PROVIDER_ID, value, '15')).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
    expect(() => isLeverageEqual(sdk, VENUE_PROVIDER_ID, '15', value)).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })

  it('rejects an unknown provider', () => {
    expect(() => isLeverageEqual(sdk, 'unknown', '15', '15')).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.SDKError })
    )
  })
})

describe('safeIsLeverageEqual', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns no comparison and warns for an invalid venue value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      safeIsLeverageEqual(sdk, VENUE_PROVIDER_ID, '15', 'invalid')
    ).toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })

  it('preserves a valid disagreement', () => {
    expect(safeIsLeverageEqual(sdk, VENUE_PROVIDER_ID, '15', '14.99')).toBe(
      false
    )
  })
})
