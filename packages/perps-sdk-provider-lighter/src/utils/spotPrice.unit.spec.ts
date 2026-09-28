import { PerpsError } from '@lifi/perps-sdk'
import type { Market, MarketContext } from '@lifi/perps-types'
import { PositionMarginAdjustment } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { spotPriceByAssetId } from './spotPrice.js'

const asset = (id: string, displaySymbol: string) => ({
  providerId: 'lighter',
  id,
  displaySymbol,
  logoURI: '',
})

const USDC = asset('USDC', 'USDC')

const spotMarket = (id: string, baseAssetId: string): Market => ({
  providerId: 'lighter',
  id,
  categoryId: 'spot',
  baseAsset: asset(baseAssetId, 'ETH'),
  quoteAsset: USDC,
  szDecimals: 4,
})

const perpsMarket = (id: string): Market => ({
  providerId: 'lighter',
  id,
  categoryId: 'perps',
  baseAsset: asset(id, 'BTC'),
  quoteAsset: USDC,
  szDecimals: 4,
  maxLeverage: 50,
  onlyIsolated: false,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
})

const HELD: ReadonlySet<string> = new Set(['1'])

const context = (marketId: string, markPrice: string): MarketContext => ({
  marketId,
  midPrice: markPrice,
  markPrice,
})

describe('spotPriceByAssetId', () => {
  it('keys a spot market mark by its base asset id, not the market id', () => {
    const prices = spotPriceByAssetId(
      [spotMarket('2048', '1')],
      'spot',
      [context('2048', '2714.67')],
      HELD
    )
    expect([...prices.keys()]).toEqual(['1'])
    expect(prices.get('1')?.toFixed()).toBe('2714.67')
  })

  it('ignores markets outside the spot category', () => {
    const prices = spotPriceByAssetId(
      [perpsMarket('0')],
      'spot',
      [context('0', '50000')],
      new Set(['0'])
    )
    expect(prices.size).toBe(0)
  })

  it('adds no entry for a spot market without a context row', () => {
    expect(
      spotPriceByAssetId([spotMarket('2048', '1')], 'spot', [], HELD).size
    ).toBe(0)
  })

  it('adds no entry for a non-positive mark', () => {
    const prices = spotPriceByAssetId(
      [spotMarket('2048', '1'), spotMarket('2049', '2')],
      'spot',
      [context('2048', '0'), context('2049', '-1')],
      new Set(['1', '2'])
    )
    expect(prices.size).toBe(0)
  })

  it('takes the first priced market when two spot markets share a base asset', () => {
    const prices = spotPriceByAssetId(
      [
        spotMarket('2048', '1'),
        spotMarket('2049', '1'),
        spotMarket('2050', '1'),
      ],
      'spot',
      [context('2048', '0'), context('2049', '2700'), context('2050', '2800')],
      HELD
    )
    expect(prices.get('1')?.toFixed()).toBe('2700')
  })

  it('adds no entry for a base asset outside the requested ids', () => {
    const prices = spotPriceByAssetId(
      [spotMarket('2048', '1'), spotMarket('2049', '2')],
      'spot',
      [context('2048', '2714.67'), context('2049', '0.5')],
      HELD
    )
    expect([...prices.keys()]).toEqual(['1'])
  })

  it('does not read the mark of a market whose base asset is not requested', () => {
    const prices = spotPriceByAssetId(
      [spotMarket('2048', '1'), spotMarket('2049', '2')],
      'spot',
      [context('2048', '2714.67'), context('2049', 'n/a')],
      HELD
    )
    expect(prices.get('1')?.toFixed()).toBe('2714.67')
  })

  it('rejects a non-decimal mark for a requested asset', () => {
    expect(() =>
      spotPriceByAssetId(
        [spotMarket('2048', '1')],
        'spot',
        [context('2048', 'n/a')],
        HELD
      )
    ).toThrow(PerpsError)
  })
})
