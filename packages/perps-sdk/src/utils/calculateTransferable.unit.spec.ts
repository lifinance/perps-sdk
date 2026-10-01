import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import { calculateTransferable } from './calculateTransferable.js'

describe('calculateTransferable', () => {
  it.each([
    ['withdrawable below the balance', '5', '8', '5'],
    ['withdrawable above the balance', '9', '8', '8'],
    ['withdrawable equal to the balance', '8', '8', '8'],
    ['zero withdrawable', '0', '8', '0'],
    ['negative withdrawable', '-1', '8', '0'],
    ['negative withdrawable and zero balance', '-1', '0', '0'],
    ['decimal withdrawable', '0.1', '0.3', '0.1'],
  ])('returns the capped amount for a %s', (_, withdrawable, balance, expected) => {
    expect(
      calculateTransferable(new Big(withdrawable), new Big(balance)).toFixed()
    ).toBe(expected)
  })
})
