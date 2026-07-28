import type { PerpsMarketDisplay } from '@lifi/perps-types'
import {
  MarginMode,
  PositionMarginAdjustment,
  PositionSide,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { HlAssetPosition } from '../types/index.js'
import { mapPosition } from './mapPosition.js'

const BTC_MARKET: PerpsMarketDisplay = {
  providerId: 'hyperliquid',
  id: 'BTC',
  categoryId: 'hyperliquid',
  baseAsset: {
    providerId: 'hyperliquid',
    id: 'BTC',
    displaySymbol: 'BTC',
    logoURI: 'https://app.hyperliquid.xyz/coins/BTC.svg',
  },
  quoteAsset: {
    providerId: 'hyperliquid',
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: 'https://app.hyperliquid.xyz/coins/USDC.svg',
  },
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
}

const makeAp = (
  overrides: Partial<HlAssetPosition['position']>
): HlAssetPosition => ({
  position: {
    coin: 'BTC',
    szi: '0.1',
    entryPx: '94000',
    positionValue: '9500',
    liquidationPx: '85000',
    unrealizedPnl: '100',
    marginUsed: '940',
    leverage: { type: 'cross', value: 10 },
    ...overrides,
  },
})

const map = (ap: HlAssetPosition) => mapPosition(ap, BTC_MARKET)

describe('mapPosition (Hyperliquid)', () => {
  it('maps a long cross position with derived mark price', () => {
    const result = map(makeAp({ szi: '0.1', positionValue: '9500' }))

    expect(result.side).toBe(PositionSide.LONG)
    expect(result.size).toBe('0.1')
    expect(result.entryPrice).toBe('94000')
    // markPrice = positionValue / |szi| = 9500 / 0.1 = 95000
    expect(result.markPrice).toBe('95000')
    expect(result.liquidationPrice).toBe('85000')
    expect(result.leverage).toBe(10)
    expect(result.initialMarginRequirement).toBe('950')
    expect(result.marginMode).toBe(MarginMode.CROSS)
    expect(result.market).toBe(BTC_MARKET)
  })

  it('classifies a negative szi as SHORT and reports absolute size', () => {
    const result = map(makeAp({ szi: '-0.25', positionValue: '23750' }))

    expect(result.side).toBe(PositionSide.SHORT)
    expect(result.size).toBe('0.25')
    // markPrice uses |szi|: 23750 / 0.25 = 95000
    expect(result.markPrice).toBe('95000')
  })

  it('treats szi exactly 0 as LONG (>= 0) and yields markPrice "0"', () => {
    const result = map(makeAp({ szi: '0', positionValue: '0' }))

    expect(result.side).toBe(PositionSide.LONG)
    expect(result.size).toBe('0')
    expect(result.markPrice).toBe('0')
  })

  it('rejects a missing positionValue instead of inventing risk data', () => {
    expect(() => map(makeAp({ szi: '0.1', positionValue: '' }))).toThrowError()
  })

  it('maps isolated leverage type to MarginMode.ISOLATED', () => {
    const result = map(makeAp({ leverage: { type: 'isolated', value: 5 } }))

    expect(result.marginMode).toBe(MarginMode.ISOLATED)
    expect(result.leverage).toBe(5)
    expect(result.marginUsed).toBe('840')
    expect(result.initialMarginRequirement).toBe('1900')
  })

  it('defaults entryPrice and liquidationPrice to "0" when null', () => {
    const result = map(
      makeAp({
        entryPx: null as unknown as string,
        liquidationPx: null as unknown as string,
      })
    )

    expect(result.entryPrice).toBe('0')
    expect(result.liquidationPrice).toBe('0')
  })
})
