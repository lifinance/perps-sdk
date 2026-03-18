import { describe, expect, it } from 'vitest'
import { validateMargin } from './validation.js'

describe('validateMargin', () => {
  it('should return empty string for zero margin', () => {
    expect(validateMargin(0, 10, 1000, 0.00035, 10)).toBe('')
  })

  it('should return empty string for negative margin', () => {
    expect(validateMargin(-5, 10, 1000, 0.00035, 10)).toBe('')
  })

  it('should return insufficient when margin exceeds balance', () => {
    expect(validateMargin(500, 10, 100, 0.00035, 10)).toBe('insufficient')
  })

  it('should skip balance check when balance is null', () => {
    expect(validateMargin(500, 10, null, 0.00035, 10)).toBe('')
  })

  it('should return below-minimum when margin minus fees is below minimum', () => {
    // margin=10, leverage=10, feeRate=0.01 → fee = 10*10*0.01 = 1 → net = 9 < 10
    expect(validateMargin(10, 10, 1000, 0.01, 10)).toBe('below-minimum')
  })

  it('should skip fee check when feeRate is null', () => {
    expect(validateMargin(10, 10, 1000, null, 10)).toBe('')
  })

  it('should return empty string when all checks pass', () => {
    expect(validateMargin(100, 10, 1000, 0.00035, 10)).toBe('')
  })
})
