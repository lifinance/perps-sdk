import { describe, expect, it } from 'vitest'
import { DECIMAL_PATTERN } from './decimal.js'

describe('DECIMAL_PATTERN', () => {
  it('carries no global flag, so repeated tests stay stateless', () => {
    expect(DECIMAL_PATTERN.global).toBe(false)
    expect(DECIMAL_PATTERN.test('0.5')).toBe(true)
    expect(DECIMAL_PATTERN.test('0.5')).toBe(true)
  })

  it('matches the backend source pattern byte for byte', () => {
    expect(DECIMAL_PATTERN.source).toBe('^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?$')
  })
})
