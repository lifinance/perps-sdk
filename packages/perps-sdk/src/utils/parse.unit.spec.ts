import { describe, expect, it } from 'vitest'
import { stringToFloat } from './parse.js'

describe('stringToFloat', () => {
  it('should parse a plain number', () => {
    expect(stringToFloat('123.45')).toBe(123.45)
  })

  it('should strip dollar sign prefix', () => {
    expect(stringToFloat('$99.99')).toBe(99.99)
  })

  it('should handle positive sign prefix', () => {
    expect(stringToFloat('+42.5')).toBe(42.5)
  })

  it('should handle negative sign prefix', () => {
    expect(stringToFloat('-10.5')).toBe(-10.5)
  })

  it('should handle dollar sign with sign prefix', () => {
    expect(stringToFloat('+$100')).toBe(100)
    expect(stringToFloat('-$50.25')).toBe(-50.25)
  })

  it('should strip thousands separators', () => {
    expect(stringToFloat('1,234,567.89')).toBe(1234567.89)
    expect(stringToFloat('$1,000')).toBe(1000)
  })

  it('should strip percent suffix', () => {
    expect(stringToFloat('5.5%')).toBe(5.5)
  })

  it('should handle whitespace', () => {
    expect(stringToFloat('  $ 42  ')).toBe(42)
  })

  it('should return NaN for non-numeric strings', () => {
    expect(stringToFloat('abc')).toBeNaN()
  })

  it('should return zero for empty string', () => {
    expect(stringToFloat('')).toBe(0)
  })

  it('should return zero for whitespace-only string', () => {
    expect(stringToFloat('   ')).toBe(0)
  })

  it('should return zero for symbols-only string', () => {
    expect(stringToFloat('$%')).toBe(0)
  })
})
