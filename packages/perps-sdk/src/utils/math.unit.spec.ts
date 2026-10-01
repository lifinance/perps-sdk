import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import { maxOf, minOf } from './math.js'

describe('maxOf', () => {
  it.each([
    ['5', '8', '8'],
    ['8', '5', '8'],
    ['8', '8', '8'],
    ['-1', '0', '0'],
    ['0.1', '0.3', '0.3'],
  ])('maxOf(%s, %s) is %s', (a, b, expected) => {
    expect(maxOf(new Big(a), new Big(b)).toFixed()).toBe(expected)
  })
})

describe('minOf', () => {
  it.each([
    ['5', '8', '5'],
    ['8', '5', '5'],
    ['8', '8', '8'],
    ['-1', '0', '-1'],
    ['0.1', '0.3', '0.1'],
  ])('minOf(%s, %s) is %s', (a, b, expected) => {
    expect(minOf(new Big(a), new Big(b)).toFixed()).toBe(expected)
  })
})
