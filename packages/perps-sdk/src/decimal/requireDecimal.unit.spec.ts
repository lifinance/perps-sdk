import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { validateDecimal } from './parse.js'
import { requireDecimal } from './requireDecimal.js'

describe('validateDecimal', () => {
  it.each(['0', '1.5', '-2.25', '100'])('returns %s unchanged', (value) => {
    expect(validateDecimal(value, 'amount')).toBe(value)
  })

  it.each([
    '1e-8',
    '1E5',
    'n/a',
    '',
    ' 1',
    '1,000',
  ])('throws ValidationError naming the field for %j', (value) => {
    expect(() => validateDecimal(value, 'amount')).toThrowError(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: expect.stringContaining('`amount`'),
      })
    )
  })
})

describe('requireDecimal', () => {
  it('parses a valid decimal string', () => {
    expect(requireDecimal('1.5', 'amount').toFixed()).toBe('1.5')
  })

  it('rejects an exponent string', () => {
    expect(() => requireDecimal('1e-8', 'amount')).toThrowError(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})
