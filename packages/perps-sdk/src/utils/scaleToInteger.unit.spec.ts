import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { PerpsError } from '../errors/PerpsError.js'
import { scaleToInteger } from './scaleToInteger.js'

const expectValidationError = (fn: () => unknown, match: RegExp) => {
  expect(fn).toThrowError(match)
  try {
    fn()
    expect.unreachable('expected fn to throw')
  } catch (e) {
    if (!(e instanceof PerpsError)) {
      throw e
    }
    expect(e.code).toBe(PerpsErrorCode.ValidationError)
  }
}

describe('scaleToInteger', () => {
  it('scales on-grid values exactly under both policies', () => {
    // 0.29 * 100 === 28.999999999999996 in binary floats; exact decimal
    // arithmetic must yield 29 regardless of policy.
    expect(scaleToInteger('0.29', 2, 'truncate')).toBe(29)
    expect(scaleToInteger('0.29', 2, 'round')).toBe(29)
    expect(scaleToInteger('8.2', 1, 'truncate')).toBe(82)
    expect(scaleToInteger('1.5', 2, 'round')).toBe(150)
    expect(scaleToInteger('0.001', 6, 'truncate')).toBe(1000)
    expect(scaleToInteger('61729.6', 1, 'round')).toBe(617296)
    expect(scaleToInteger('45000', 0, 'truncate')).toBe(45000)
  })

  it('truncates off-grid values toward zero on both sides of the step', () => {
    expect(scaleToInteger('0.294', 2, 'truncate')).toBe(29)
    expect(scaleToInteger('0.296', 2, 'truncate')).toBe(29)
    expect(scaleToInteger('0.299999', 2, 'truncate')).toBe(29)
    expect(scaleToInteger('-0.296', 2, 'truncate')).toBe(-29)
  })

  it('rounds off-grid values to the nearest grid point on both sides of the step', () => {
    expect(scaleToInteger('0.294', 2, 'round')).toBe(29)
    expect(scaleToInteger('0.296', 2, 'round')).toBe(30)
    expect(scaleToInteger('0.295', 2, 'round')).toBe(30)
    expect(scaleToInteger('-0.296', 2, 'round')).toBe(-30)
  })

  it('handles large magnitudes exactly up to Number.MAX_SAFE_INTEGER', () => {
    expect(scaleToInteger('4500000000.123456', 6, 'truncate')).toBe(
      4500000000123456
    )
    expect(scaleToInteger('9007199254740.991', 3, 'truncate')).toBe(
      Number.MAX_SAFE_INTEGER
    )
  })

  it('rejects scaled results beyond Number.MAX_SAFE_INTEGER', () => {
    expectValidationError(
      () => scaleToInteger('9007199254740.992', 3, 'truncate'),
      /MAX_SAFE_INTEGER/
    )
  })

  it('rejects non-numeric input loudly', () => {
    expectValidationError(
      () => scaleToInteger('abc', 2, 'truncate'),
      /Invalid decimal string/
    )
    expectValidationError(
      () => scaleToInteger('', 2, 'round'),
      /Invalid decimal string/
    )
  })

  it('rejects invalid decimals', () => {
    expectValidationError(
      () => scaleToInteger('1', -1, 'truncate'),
      /Invalid decimals/
    )
    expectValidationError(
      () => scaleToInteger('1', 1.5, 'round'),
      /Invalid decimals/
    )
  })
})
