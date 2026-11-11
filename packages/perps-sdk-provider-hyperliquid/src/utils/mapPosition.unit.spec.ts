import { remarkPosition } from '@lifi/perps-sdk'
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

const map = (ap: HlAssetPosition, mapper = mapPosition): Position => {
  const position = mapper(ap, BTC_MARKET)
  if (position === undefined) {
    throw new Error('expected a mapped position')
  }
  return position
}

// A fresh module instance gives the warn-once state of the mapper a clean start.
const freshMapPosition = async (): Promise<typeof mapPosition> => {
  vi.resetModules()
  return (await import('./mapPosition.js')).mapPosition
}

const CALCULATED_ROE = '10.63829787234042553191489361702127659574'

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

  it('sets positionValue from the venue value and calculates the other fields', () => {
    const result = map(makeAp({}))

    expect(result).toMatchObject({
      markPrice: '95000',
      unrealizedPnl: '100',
      marginUsed: '940',
      positionValue: '9500',
      // 100 ÷ (0.1 × 94000 ÷ 10) × 100
      returnOnEquity: '10.63829787234042553191489361702127659574',
      // 9500 ÷ 940
      effectiveLeverage: '10.11',
      // |85000 − 95000| ÷ 95000 × 100
      liquidationDistance: '10.53',
    })
  })

  it('changes the venue returnOnEquity fraction to a percent', () => {
    // 40x isolated: marginUsed holds the added margin and the unrealized PnL
    const result = map(
      makeAp({
        leverage: { type: 'isolated', value: 40 },
        marginUsed: '1265',
        returnOnEquity: '0.0985',
      })
    )

    expect(result.returnOnEquity).toBe('9.85')
  })

  it('keeps the same returnOnEquity through remarkPosition at the same mark when isolated marginUsed holds added margin and PnL', () => {
    // 0.1 BTC at 10x, entry 100000, mark 105000: PnL 500 on initial margin 1000
    const isolatedRow = (marginUsed: string): HlAssetPosition =>
      makeAp({
        entryPx: '100000',
        positionValue: '10500',
        unrealizedPnl: '500',
        returnOnEquity: '0.5',
        marginUsed,
        leverage: { type: 'isolated', value: 10 },
      })
    // 1050 initial margin at the mark + 1000 added margin + 500 PnL
    const mapped = map(isolatedRow('2550'))
    const snapshot = { ...mapped }

    expect(mapped.markPrice).toBe('105000')
    expect(mapped.returnOnEquity).toBe('50')

    const remarked = remarkPosition(mapped, '105000')

    expect(remarked.unrealizedPnl).toBe('500')
    expect(remarked.returnOnEquity).toBe('50')
    expect(remarked.marginUsed).toBe('2550')
    expect(mapped).toEqual(snapshot)

    expect(
      remarkPosition(map(isolatedRow('1050')), '105000').returnOnEquity
    ).toBe('50')
  })

  it('keeps a negative venue returnOnEquity through remarkPosition at the same mark', () => {
    // 0.1 BTC at 10x, entry 100000, mark 97500: PnL -250 on initial margin 1000
    const mapped = map(
      makeAp({
        entryPx: '100000',
        positionValue: '9750',
        unrealizedPnl: '-250',
        returnOnEquity: '-0.25',
        marginUsed: '1975',
        leverage: { type: 'isolated', value: 10 },
      })
    )

    expect(mapped.returnOnEquity).toBe('-25')
    expect(remarkPosition(mapped, '97500').returnOnEquity).toBe('-25')
  })

  it.each([
    '',
    'NaN',
    '1e-2',
  ])('keeps the row with the calculated returnOnEquity and warns once when returnOnEquity is %j', async (returnOnEquity) => {
    const mapper = await freshMapPosition()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = map(makeAp({ returnOnEquity }), mapper)

    expect(result.size).toBe('0.1')
    expect(result.returnOnEquity).toBe(CALCULATED_ROE)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('returnOnEquity'))
  })

  it('warns once for repeated rows with different invalid returnOnEquity values', async () => {
    const mapper = await freshMapPosition()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    for (const returnOnEquity of ['NaN', '', '1e-2', 'NaN']) {
      map(makeAp({ returnOnEquity }), mapper)
    }

    expect(warn).toHaveBeenCalledOnce()
  })

  it('does not warn when returnOnEquity is absent', async () => {
    const mapper = await freshMapPosition()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(map(makeAp({}), mapper).returnOnEquity).toBe(CALCULATED_ROE)
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps a valid venue returnOnEquity when leverage.value is zero, and remarkPosition leaves it absent', async () => {
    const mapper = await freshMapPosition()
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const mapped = map(
      makeAp({
        returnOnEquity: '0.0985',
        leverage: { type: 'isolated', value: 0 },
      }),
      mapper
    )

    expect(mapped.returnOnEquity).toBe('9.85')
    expect(mapped).not.toHaveProperty('leverage')

    const remarked = remarkPosition(mapped, '95000')

    expect(remarked.unrealizedPnl).toBe('100')
    expect(remarked).not.toHaveProperty('returnOnEquity')
  })

  it('takes the positionValue magnitude', () => {
    expect(
      map(makeAp({ szi: '-0.25', positionValue: '-23750' })).positionValue
    ).toBe('23750')
  })

  it('leaves effectiveLeverage absent and keeps returnOnEquity when marginUsed is zero', () => {
    const result = map(makeAp({ marginUsed: '0' }))

    expect(result).not.toHaveProperty('effectiveLeverage')
    expect(result.returnOnEquity).toBe(CALCULATED_ROE)
    expect(result.liquidationDistance).toBe('10.53')
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

  it('keeps the row without markPrice, initialMarginRequirement and the mark-based fields, and warns once, when positionValue is invalid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = map(makeAp({ positionValue: '' }))

    expect(result.size).toBe('0.1')
    expect(result.leverage).toBe('10')
    expect(result.returnOnEquity).toBe(CALCULATED_ROE)
    expect(result).not.toHaveProperty('markPrice')
    expect(result).not.toHaveProperty('initialMarginRequirement')
    expect(result).not.toHaveProperty('positionValue')
    expect(result).not.toHaveProperty('effectiveLeverage')
    expect(result).not.toHaveProperty('liquidationDistance')
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

  it('leaves liquidationPrice absent for a cross position with a null liquidationPx', () => {
    const result = map(
      makeAp({ liquidationPx: null, leverage: { type: 'cross', value: 10 } })
    )

    expect(result).not.toHaveProperty('liquidationPrice')
    expect(result.marginMode).toBe(MarginMode.CROSS)
  })

  it('leaves liquidationPrice absent for an empty liquidationPx', () => {
    expect(map(makeAp({ liquidationPx: '' }))).not.toHaveProperty(
      'liquidationPrice'
    )
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
