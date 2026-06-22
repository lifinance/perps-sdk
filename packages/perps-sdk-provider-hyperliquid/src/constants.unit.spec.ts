import type { FeeTier } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { HYPERLIQUID_FEE_TIER_FALLBACK } from './constants.js'

describe('HYPERLIQUID_FEE_TIER_FALLBACK', () => {
  it('matches the FeeTier shape with string maker/taker rates', () => {
    const tier: FeeTier = HYPERLIQUID_FEE_TIER_FALLBACK
    expect(Object.keys(tier).sort()).toEqual(['maker', 'taker'])
    expect(typeof tier.maker).toBe('string')
    expect(typeof tier.taker).toBe('string')
  })

  it('exposes the published baseline rates as fractions', () => {
    expect(HYPERLIQUID_FEE_TIER_FALLBACK.maker).toBe('0.00015')
    expect(HYPERLIQUID_FEE_TIER_FALLBACK.taker).toBe('0.00045')
  })

  it('parses to in-range fraction values with taker above maker', () => {
    const maker = Number.parseFloat(HYPERLIQUID_FEE_TIER_FALLBACK.maker)
    const taker = Number.parseFloat(HYPERLIQUID_FEE_TIER_FALLBACK.taker)
    expect(maker).toBeGreaterThan(0)
    expect(maker).toBeLessThan(1)
    expect(taker).toBeGreaterThan(0)
    expect(taker).toBeLessThan(1)
    expect(taker).toBeGreaterThan(maker)
  })
})
