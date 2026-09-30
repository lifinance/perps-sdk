import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import { transferableWithin } from './transferableWithin.js'

describe('transferableWithin', () => {
  it.each([
    ['venue figure below the units', '5', '8', '5'],
    ['venue figure above the units', '9', '8', '8'],
    ['venue figure equal to the units', '8', '8', '8'],
    ['zero venue figure', '0', '8', '0'],
    ['negative venue figure', '-1', '8', '0'],
    ['negative venue figure and zero units', '-1', '0', '0'],
    ['decimal venue figure', '0.1', '0.3', '0.1'],
  ])('returns the capped amount for a %s', (_, venue, units, expected) => {
    expect(transferableWithin(new Big(venue), new Big(units)).toFixed()).toBe(
      expected
    )
  })
})
