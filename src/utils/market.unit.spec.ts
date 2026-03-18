import { describe, expect, it } from 'vitest'
import { getAsset, getQuoteAsset, getVenue } from './market.js'

describe('getVenue', () => {
  it('should extract venue from colon-delimited key', () => {
    expect(getVenue('xyz:TSLA')).toBe('xyz')
  })

  it('should return empty string for plain symbol', () => {
    expect(getVenue('ETH')).toBe('')
  })
})

describe('getAsset', () => {
  it('should extract asset from colon-delimited key', () => {
    expect(getAsset('xyz:TSLA')).toBe('TSLA')
  })

  it('should return full string for plain symbol', () => {
    expect(getAsset('ETH')).toBe('ETH')
  })
})

describe('getQuoteAsset', () => {
  it('should return mapped quote asset for known venue', () => {
    const map = new Map([['k', 'USDT']])
    expect(getQuoteAsset('k:ETH', map)).toBe('USDT')
  })

  it('should default to USDC for unknown venue', () => {
    const map = new Map<string, string>()
    expect(getQuoteAsset('ETH', map)).toBe('USDC')
  })
})
