import { describe, expect, it } from 'vitest'
import { HL_MARKETS_WITH_SPOT } from '../../test/fixtures.js'
import { spotAsset, spotBalance, spotPriceByCoin } from './spotBalance.js'

describe('spotAsset', () => {
  it('synthesises the display from coin and stamps the token id', () => {
    expect(spotAsset({ coin: 'PURR', token: 1 })).toEqual({
      providerId: 'hyperliquid',
      id: '1',
      displaySymbol: 'PURR',
      logoURI: 'https://app.hyperliquid.xyz/coins/PURR.svg',
    })
  })
})

describe('spotPriceByCoin', () => {
  it('keys spot prices by base-token identity, not the pair display string', () => {
    const map = spotPriceByCoin(HL_MARKETS_WITH_SPOT)
    expect(map.get('PURR')).toBe(0.5)
    expect(map.has('PURR/USDC')).toBe(false)
  })

  it('excludes perp markets so a shared symbol cannot inherit the perp mark', () => {
    const map = spotPriceByCoin(HL_MARKETS_WITH_SPOT)
    // BTC is a perp (mark 95000) but has no spot pair here.
    expect(map.has('BTC')).toBe(false)
  })

  it('prices the USDC quote leg at $1', () => {
    expect(spotPriceByCoin(HL_MARKETS_WITH_SPOT).get('USDC')).toBe(1)
  })
})

describe('spotBalance', () => {
  it('values the holding at units * spot mark price', () => {
    const map = spotPriceByCoin(HL_MARKETS_WITH_SPOT)
    expect(spotBalance({ coin: 'PURR', token: 1, total: '100' }, map)).toEqual({
      categoryId: 'spot',
      asset: {
        providerId: 'hyperliquid',
        id: '1',
        displaySymbol: 'PURR',
        logoURI: 'https://app.hyperliquid.xyz/coins/PURR.svg',
      },
      units: '100',
      valueUsd: '50',
    })
  })

  it('values an unpriced token at zero rather than inheriting a stray price', () => {
    const map = spotPriceByCoin(HL_MARKETS_WITH_SPOT)
    expect(
      spotBalance({ coin: 'UNKNOWN', token: 9, total: '100' }, map).valueUsd
    ).toBe('0')
  })
})
