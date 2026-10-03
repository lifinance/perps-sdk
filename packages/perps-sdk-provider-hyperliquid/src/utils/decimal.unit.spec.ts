import { isDecimalString, PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { toMarketContextString, toWireBig } from './decimal.js'

describe('toWireBig', () => {
  it('parses a wire decimal exactly', () => {
    expect(toWireBig('1234.5600000001', 'accountValue').toFixed()).toBe(
      '1234.5600000001'
    )
  })

  it('throws a named SDKError that identifies the field', () => {
    try {
      toWireBig('n/a', 'marginSummary.accountValue')
      expect.unreachable('toWireBig must throw on a non-decimal value')
    } catch (error) {
      expect(error).toBeInstanceOf(PerpsError)
      expect((error as PerpsError).code).toBe(PerpsErrorCode.SDKError)
      expect((error as PerpsError).message).toContain(
        'marginSummary.accountValue'
      )
    }
  })
})

describe('toMarketContextString', () => {
  it('passes a string through', () => {
    expect(toMarketContextString('95000.5')).toBe('95000.5')
  })

  it.each([
    [1e-7, '0.0000001'],
    [1e21, '1000000000000000000000'],
  ])('spells the number %s in plain notation', (value, expected) => {
    const result = toMarketContextString(value)

    expect(result).toBe(expected)
    expect(isDecimalString(result ?? '')).toBe(true)
  })

  it.each([null, undefined, true, {}, [1]])('treats %j as absent', (value) => {
    expect(toMarketContextString(value)).toBeUndefined()
  })
})
