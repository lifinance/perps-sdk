import { describe, expect, it } from 'vitest'
import { priceStepToAggregation } from './priceStepToAggregation.js'

describe('priceStepToAggregation', () => {
  it('requests full precision (no nSigFigs) when the step is finer than 5 significant figures', () => {
    // BTC ~73 523, native tick 0.1 → step 0.1 needs 6 sig figs, beyond HL's max.
    expect(priceStepToAggregation(0.1, 73523.1)).toEqual({})
  })

  it('maps a power-of-ten step onto the significant-figure grid for the reference magnitude', () => {
    // floor(log10(73523)) = 4, so nSigFigs = 4 - log10(step) + 1.
    expect(priceStepToAggregation(1, 73523.1)).toEqual({ nSigFigs: 5 })
    expect(priceStepToAggregation(10, 73523.1)).toEqual({ nSigFigs: 4 })
    expect(priceStepToAggregation(100, 73523.1)).toEqual({ nSigFigs: 3 })
    expect(priceStepToAggregation(1000, 73523.1)).toEqual({ nSigFigs: 2 })
  })

  it('clamps to the coarsest HL granularity (nSigFigs 2) when the step exceeds it', () => {
    expect(priceStepToAggregation(10000, 73523.1)).toEqual({ nSigFigs: 2 })
  })

  it('scales with the reference price magnitude', () => {
    // ETH ~3 500: floor(log10) = 3, step 1 → nSigFigs = 3 - 0 + 1 = 4.
    expect(priceStepToAggregation(1, 3521.4)).toEqual({ nSigFigs: 4 })
    expect(priceStepToAggregation(10, 3521.4)).toEqual({ nSigFigs: 3 })
  })

  it('handles sub-dollar assets by significant-figure count', () => {
    // A ~0.0033 asset has 4 sig figs: floor(log10(0.0033)) = -3, log10(1e-6) = -6,
    // nSigFigs = -3 - (-6) + 1 = 4 (its native granularity).
    expect(priceStepToAggregation(0.000001, 0.003348)).toEqual({ nSigFigs: 4 })
    // Coarsen ×100 → step 1e-4: nSigFigs = -3 - (-4) + 1 = 2.
    expect(priceStepToAggregation(0.0001, 0.003348)).toEqual({ nSigFigs: 2 })
  })

  it('emits mantissa only for a non-power-of-ten step at the 5-sig-fig boundary', () => {
    // step 2 at BTC magnitude: power-of-ten base 1 → nSigFigs 5, mantissa 2.
    expect(priceStepToAggregation(2, 73523.1)).toEqual({
      nSigFigs: 5,
      mantissa: 2,
    })
    expect(priceStepToAggregation(5, 73523.1)).toEqual({
      nSigFigs: 5,
      mantissa: 5,
    })
  })

  it('drops mantissa when the coarser step lands on a lower sig-fig grid (HL honours mantissa only at nSigFigs 5)', () => {
    // step 20 → base 10 (nSigFigs 4); HL ignores mantissa below 5, so omit it.
    expect(priceStepToAggregation(20, 73523.1)).toEqual({ nSigFigs: 4 })
  })

  it('returns full precision for invalid inputs', () => {
    expect(priceStepToAggregation(0, 73523.1)).toEqual({})
    expect(priceStepToAggregation(1, 0)).toEqual({})
    expect(priceStepToAggregation(Number.NaN, 73523.1)).toEqual({})
    expect(priceStepToAggregation(1, Number.NaN)).toEqual({})
  })
})
