import { describe, expect, it } from 'vitest'
import { assetIsSpot, calculateAssetId, getProviderIndex } from './assetId.js'

describe('assetIsSpot', () => {
  it('treats an "@<pairIndex>" id as spot', () => {
    expect(assetIsSpot('@0')).toBe(true)
    expect(assetIsSpot('@230')).toBe(true)
  })

  it('treats a bare perp coin as non-spot', () => {
    expect(assetIsSpot('BTC')).toBe(false)
    expect(assetIsSpot('xyz:PURR')).toBe(false)
  })
})

describe('calculateAssetId', () => {
  it('returns the bare index for the main provider (index 0)', () => {
    expect(calculateAssetId(0, 0)).toBe(0)
    expect(calculateAssetId(0, 42)).toBe(42)
  })

  it('offsets HIP-3 sub-provider ids by 100k + perpDexIndex*10k', () => {
    // provider 1, asset 0 → 100_000 + 1*10_000 + 0
    expect(calculateAssetId(1, 0)).toBe(110_000)
    // provider 1, asset 5 → 110_005
    expect(calculateAssetId(1, 5)).toBe(110_005)
    // provider 3, asset 7 → 100_000 + 30_000 + 7
    expect(calculateAssetId(3, 7)).toBe(130_007)
  })
})

describe('getProviderIndex', () => {
  it('returns the index of a known sub-provider', () => {
    expect(getProviderIndex('xyz', ['xyz', 'flv'])).toBe(0)
    expect(getProviderIndex('flv', ['xyz', 'flv'])).toBe(1)
  })

  it('throws for an unknown sub-provider', () => {
    expect(() => getProviderIndex('nope', ['xyz', 'flv'])).toThrow(
      'Unknown sub-provider: nope'
    )
  })
})
