import { describe, expect, it } from 'vitest'

import { deriveMarket } from './_market.js'

// ---------------------------------------------------------------------------
// deriveMarket — translates the HL canonical `assetId` to the
// `/providers.markets[].id` taxonomy. Regression coverage for ORD-305.
// ---------------------------------------------------------------------------

describe('deriveMarket (Hyperliquid)', () => {
  it('maps a bare perp coin to "hyperliquid" (main USDC perp dex)', () => {
    expect(deriveMarket('BTC')).toBe('hyperliquid')
    expect(deriveMarket('ETH')).toBe('hyperliquid')
  })

  it('maps a HIP-3 sub-dex prefixed coin to the sub-dex name', () => {
    expect(deriveMarket('xyz:PURR')).toBe('xyz')
    expect(deriveMarket('flv:HYPE')).toBe('flv')
  })

  it('maps an "@<pairIndex>" spot identifier to "spot"', () => {
    expect(deriveMarket('@0')).toBe('spot')
    expect(deriveMarket('@142')).toBe('spot')
    expect(deriveMarket('@230')).toBe('spot')
  })

  it('treats a colon at position 0 as bare (no real sub-dex name)', () => {
    // Defensive: an assetId that starts with ":" has an empty prefix, which
    // is not a valid sub-dex. Fall back to the main perp dex rather than
    // emitting an empty market string.
    expect(deriveMarket(':PURR')).toBe('hyperliquid')
  })
})
