import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { isDecimalString } from '../decimal/parse.js'
import { calculateTransferable } from './transferable.js'

describe('calculateTransferable', () => {
  it.each([
    ['a figure below the units', '3', '10', '3'],
    ['a figure above the units', '12', '10', '10'],
    ['a figure equal to the units', '10', '10', '10'],
    ['a negative figure', '-5', '10', '0'],
    ['a negative figure over zero units', '-5', '0', '0'],
    ['a sub-cent figure', '0.0000005', '10', '0.0000005'],
    ['zero units', '12', '0', '0'],
  ])('clamps %s', (_, venueFigure, units, expected) => {
    expect(calculateTransferable(venueFigure, units)).toBe(expected)
  })

  it('gives a plain decimal for a figure a float would spell with an exponent', () => {
    expect(isDecimalString(calculateTransferable('0.0000001', '1'))).toBe(true)
  })

  it.each([
    ['1e-7', '1e-7', '10'],
    ['', '', '10'],
    ['abc', '1', 'abc'],
  ])('rejects the non-decimal %j, naming the value', (value, venueFigure, units) => {
    expect(() => calculateTransferable(venueFigure, units)).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: expect.stringContaining(`'${value}'`),
      })
    )
  })

  it('reads a display form after the clean step', () => {
    expect(calculateTransferable('5', '1,000')).toBe('5')
  })
})
