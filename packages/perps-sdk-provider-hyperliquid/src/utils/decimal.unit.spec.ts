import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { toWireBig } from './decimal.js'

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
