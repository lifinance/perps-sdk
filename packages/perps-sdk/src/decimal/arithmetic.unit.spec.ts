import { PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  absDecimalString,
  addDecimalString,
  divideDecimalString,
  divideDecimalStringRoundDown,
  multiplyDecimalString,
  safeAbsDecimalString,
  safeAddDecimalString,
  safeDivideDecimalString,
  safeDivideDecimalStringRoundDown,
  safeMultiplyDecimalString,
  safeSubtractDecimalString,
  subtractDecimalString,
} from './arithmetic.js'

afterEach(() => {
  vi.restoreAllMocks()
})

const validationError = expect.objectContaining({
  code: PerpsErrorCode.ValidationError,
})

describe('addDecimalString', () => {
  it('adds exactly', () => {
    expect(addDecimalString('0.1', '0.2')).toBe('0.3')
  })

  it('reads display forms after the clean step', () => {
    expect(addDecimalString('$4', '$6')).toBe('10')
  })

  it('throws ValidationError for a bad input', () => {
    expect(() => addDecimalString('abc', '1')).toThrow(validationError)
  })
})

describe('subtractDecimalString', () => {
  it('subtracts exactly and spells zero as 0', () => {
    expect(subtractDecimalString('0.3', '0.1')).toBe('0.2')
    expect(subtractDecimalString('-1', '-1')).toBe('0')
  })
})

describe('multiplyDecimalString', () => {
  it('multiplies exactly', () => {
    expect(multiplyDecimalString('1.1', '1.1')).toBe('1.21')
  })
})

describe('divideDecimalString', () => {
  it('divides to 40 decimal places, half up', () => {
    expect(divideDecimalString('2', '3')).toBe(`0.${'6'.repeat(39)}7`)
  })

  it('throws ValidationError for a zero divisor', () => {
    expect(() => divideDecimalString('1', '0')).toThrow(validationError)
  })
})

describe('divideDecimalStringRoundDown', () => {
  it('divides to 40 decimal places, truncated', () => {
    expect(divideDecimalStringRoundDown('2', '3')).toBe(`0.${'6'.repeat(40)}`)
  })

  it('throws ValidationError for a zero divisor', () => {
    expect(() => divideDecimalStringRoundDown('1', '0.0')).toThrow(
      validationError
    )
  })
})

describe('absDecimalString', () => {
  it.each([
    ['-1.5', '1.5'],
    ['1.5', '1.5'],
    ['-0', '0'],
    ['0', '0'],
  ])('gives |%s| as %s', (value, expected) => {
    expect(absDecimalString(value)).toBe(expected)
  })

  it('throws ValidationError for a bad input', () => {
    expect(() => absDecimalString('abc')).toThrow(validationError)
  })
})

describe('safe arithmetic functions', () => {
  it('give the result for valid input', () => {
    expect(safeAddDecimalString('1', '2')).toBe('3')
    expect(safeSubtractDecimalString('1', '2')).toBe('-1')
    expect(safeMultiplyDecimalString('2', '3')).toBe('6')
    expect(safeDivideDecimalString('1', '4')).toBe('0.25')
    expect(safeDivideDecimalStringRoundDown('1', '4')).toBe('0.25')
    expect(safeAbsDecimalString('-2')).toBe('2')
  })

  it('give undefined and warn for bad input', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(safeAddDecimalString('abc', '1')).toBeUndefined()
    expect(safeSubtractDecimalString('1', 'abc')).toBeUndefined()
    expect(safeMultiplyDecimalString('abc', '1')).toBeUndefined()
    expect(safeDivideDecimalString('1', '0')).toBeUndefined()
    expect(safeDivideDecimalStringRoundDown('1', '0')).toBeUndefined()
    expect(safeAbsDecimalString('abc')).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(6)
  })
})
