import { describe, expect, it } from 'vitest'
import { HL_SPOT_MARKETS } from '../../test/fixtures.js'
import { spotAsset, spotBalance, spotPriceByAssetId } from './spotBalance.js'

const quoteSymbols = new Set(
  HL_SPOT_MARKETS.map((m) => m.quoteAsset.displaySymbol)
)

describe('spotAsset', () => {
  it('keys Asset.id on the coin symbol, NOT the token index', () => {
    expect(spotAsset({ coin: 'PURR' }).id).toBe('PURR')
  })

  it('resolves to the same id as the spot SpotMarket.baseAsset.id', () => {
    const purrMarket = HL_SPOT_MARKETS.find((m) => m.baseAsset.id === 'PURR')!
    expect(spotAsset({ coin: 'PURR' }).id).toBe(purrMarket.baseAsset.id)
  })
})

describe('spotPriceByAssetId', () => {
  it('keys spot mark prices by base-token identity (the coin symbol)', () => {
    const prices = spotPriceByAssetId(HL_SPOT_MARKETS, quoteSymbols)
    expect(prices.get('PURR')).toBe(0.6)
    expect(prices.get('VNTR')).toBe(2.5)
  })

  it('prices every quote stable at $1 — including a non-USDC quote (USDH)', () => {
    const prices = spotPriceByAssetId(HL_SPOT_MARKETS, quoteSymbols)
    expect(prices.get('USDC')).toBe(1)
    expect(prices.get('USDH')).toBe(1)
  })

  it('ignores non-spot markets when building the price map', () => {
    const prices = spotPriceByAssetId(
      [{ ...HL_SPOT_MARKETS[0], categoryId: 'hyperliquid' }],
      new Set()
    )
    expect(prices.size).toBe(0)
  })
})

describe('spotBalance', () => {
  it('values a held base token at units * spot mark price', () => {
    const prices = spotPriceByAssetId(HL_SPOT_MARKETS, quoteSymbols)
    const balance = spotBalance({ coin: 'PURR', total: '100' }, prices)
    expect(balance).toEqual({
      categoryId: 'spot',
      asset: spotAsset({ coin: 'PURR' }),
      units: '100',
      valueUsd: '60',
    })
  })

  it('values an unpriced token at $0 rather than throwing', () => {
    const balance = spotBalance({ coin: 'UNKNOWN', total: '5' }, new Map())
    expect(balance.valueUsd).toBe('0')
  })
})
