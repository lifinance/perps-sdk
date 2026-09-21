import { describe, expect, it } from 'vitest'
import { isPlaceholderTxHash } from './txHash.js'

// Rows taken verbatim from `/api/v1/recentTrades?market_id=0&limit=100`.
const PLACEHOLDER =
  '0000001d6266414e000001a0c3361302000000000000000000000000000000000000000000000000'
const SETTLED =
  '3981a9639035409777f73feb18bb96c6c07fa55127863e58f2319691924a59b0e448ab560c1b135d'

describe('isPlaceholderTxHash', () => {
  it('reports a placeholder when the trailing 24 bytes are zero', () => {
    expect(isPlaceholderTxHash(PLACEHOLDER)).toBe(true)
  })

  it('reports no placeholder for a settled 40-byte hash', () => {
    expect(isPlaceholderTxHash(SETTLED)).toBe(false)
  })

  it('reports no placeholder for a settled hash that ends in a few zeros', () => {
    expect(isPlaceholderTxHash(`${SETTLED.slice(0, 76)}0000`)).toBe(false)
  })

  it('reports no placeholder for an absent hash', () => {
    expect(isPlaceholderTxHash(undefined)).toBe(false)
  })

  it('reports no placeholder for an empty hash', () => {
    expect(isPlaceholderTxHash('')).toBe(false)
  })

  it('reports no placeholder for a hash shorter than the zero suffix', () => {
    expect(isPlaceholderTxHash('0'.repeat(48))).toBe(false)
  })

  it('reports a placeholder for an all-zero 40-byte hash', () => {
    expect(isPlaceholderTxHash('0'.repeat(80))).toBe(true)
  })
})
