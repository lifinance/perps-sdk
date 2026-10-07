import type { PerpsMarketDisplay, Position } from '@lifi/perps-types'
import {
  MarginMode,
  PositionMarginAdjustment,
  PositionSide,
} from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HlAssetPosition } from '../types/index.js'
import { isOpenAssetPosition, mapPosition } from './mapPosition.js'

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
    cumFunding: {
      allTime: '-23403.892773',
      sinceOpen: '5.788917',
      sinceChange: '0.0',
    },
    ...overrides,
  },
})

const map = (ap: HlAssetPosition): Position => {
  const position = mapPosition(ap, BTC_MARKET)
  if (position === undefined) {
    throw new Error('expected a mapped position')
  }
  return position
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('mapPosition (Hyperliquid)', () => {
  it('maps a long cross position with derived mark price', () => {
    const result = map(makeAp({ szi: '0.1', positionValue: '9500' }))

    expect(result.side).toBe(PositionSide.LONG)
    expect(result.size).toBe('0.1')
    expect(result.entryPrice).toBe('94000')
    // markPrice = positionValue / |szi| = 9500 / 0.1 = 95000
    expect(result.markPrice).toBe('95000')
    expect(result.liquidationPrice).toBe('85000')
    expect(result.leverage).toBe('10')
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

  it('skips the row and warns when szi is invalid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(mapPosition(makeAp({ szi: 'abc' }), BTC_MARKET)).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "[hyperliquid] skipping position row on market 'BTC': `szi`"
      )
    )
  })

  it('keeps the row without markPrice and initialMarginRequirement and warns once when positionValue is invalid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = map(makeAp({ positionValue: '' }))

    expect(result.size).toBe('0.1')
    expect(result.leverage).toBe('10')
    expect(result).not.toHaveProperty('markPrice')
    expect(result).not.toHaveProperty('initialMarginRequirement')
    expect(warn).toHaveBeenCalledOnce()
  })

  it('keeps the row without leverage and initialMarginRequirement, and warns once, when leverage.value is zero', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = map(makeAp({ leverage: { type: 'cross', value: 0 } }))

    expect(result.size).toBe('0.1')
    expect(result.markPrice).toBe('95000')
    expect(result).not.toHaveProperty('leverage')
    expect(result).not.toHaveProperty('initialMarginRequirement')
    expect(warn).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith(
      "[hyperliquid] position `leverage.value` is not positive: '0'"
    )
  })

  it('keeps the row without accruedFunding and warns once when cumFunding.sinceOpen is invalid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = map(
      makeAp({
        cumFunding: { allTime: '0', sinceOpen: 'NaN', sinceChange: '0' },
      })
    )

    expect(result.size).toBe('0.1')
    expect(result.initialMarginRequirement).toBe('950')
    expect(result).not.toHaveProperty('accruedFunding')
    expect(warn).toHaveBeenCalledOnce()
  })

  it('maps isolated leverage type to MarginMode.ISOLATED', () => {
    const result = map(makeAp({ leverage: { type: 'isolated', value: 5 } }))

    expect(result.marginMode).toBe(MarginMode.ISOLATED)
    expect(result.leverage).toBe('5')
    expect(result.marginUsed).toBe('940')
    expect(result.initialMarginRequirement).toBe('1900')
  })

  // Hyperliquid signs `cumFunding` as funding PAID, so the normalized
  // `accruedFunding` is its negation. Fixtures below come from
  // `clearinghouseState` for 0xf5d81a135f756ca16544e53c20fc20643ec3ad53 (BTC)
  // and 0xdf9ea6ec3b7109935ccb4fb267e15ac1fb077ab1 (HYPE short).
  describe('accruedFunding', () => {
    it('negates a paid-funding sinceOpen into a negative accruedFunding', () => {
      const result = map(
        makeAp({
          cumFunding: {
            allTime: '-23403.892773',
            sinceOpen: '5.788917',
            sinceChange: '0.0',
          },
        })
      )

      expect(result.accruedFunding).toBe('-5.788917')
    })

    it('negates a received-funding sinceOpen into a positive accruedFunding', () => {
      const result = map(
        makeAp({
          szi: '-20000.01',
          positionValue: '760000',
          cumFunding: {
            allTime: '-175865.377915',
            sinceOpen: '-175855.001206',
            sinceChange: '-29921.224787',
          },
        })
      )

      expect(result.accruedFunding).toBe('175855.001206')
    })

    it('reports "0" without a negative-zero sign when no funding accrued', () => {
      const result = map(
        makeAp({
          cumFunding: { allTime: '0.0', sinceOpen: '0.0', sinceChange: '0.0' },
        })
      )

      expect(result.accruedFunding).toBe('0')
    })

    it('reads sinceOpen rather than allTime or sinceChange', () => {
      const result = map(
        makeAp({
          cumFunding: {
            allTime: '111',
            sinceOpen: '22',
            sinceChange: '3',
          },
        })
      )

      expect(result.accruedFunding).toBe('-22')
    })
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

  it('maps an empty liquidationPx to "0"', () => {
    expect(map(makeAp({ liquidationPx: '' })).liquidationPrice).toBe('0')
  })
})

describe('isOpenAssetPosition', () => {
  it.each(['0', '0.0', '-0.0'])('gives false for a zero szi %j', (szi) => {
    expect(isOpenAssetPosition(makeAp({ szi }))).toBe(false)
  })

  it.each([
    '0.1',
    '-0.1',
    '0.00000000000000000001',
    '10oops',
  ])('gives true for szi %j', (szi) => {
    expect(isOpenAssetPosition(makeAp({ szi }))).toBe(true)
  })
})
