import type { PerpsMarketDisplay } from '@lifi/perps-types'
import {
  MarginMode,
  PositionMarginAdjustment,
  PositionSide,
} from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import type { OndoPosition } from '../types/wire.js'
import { isOpenPosition, mapOpenPositions, mapPosition } from './mapPosition.js'

const MARKET: PerpsMarketDisplay = {
  providerId: 'ondo',
  id: 'AAPL-USD.P',
  categoryId: 'ondo',
  baseAsset: {
    providerId: 'ondo',
    id: 'AAPL',
    displaySymbol: 'AAPL',
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'ondo',
    id: 'USD',
    displaySymbol: 'USD',
    logoURI: '',
  },
  positionMarginAdjustment: PositionMarginAdjustment.NONE,
}

const positionFixture = (overrides?: Partial<OndoPosition>): OndoPosition => ({
  market: 'AAPL-USD.P',
  direction: 'long',
  netQuantity: '10',
  averageEntryPrice: '200.5',
  usedMargin: '401',
  unrealizedPnl: '15.5',
  markPrice: '202.05',
  liquidationPrice: '182.3',
  bankruptcyPrice: '180.5',
  maintenanceMargin: '40.1',
  notionalValue: '2020.5',
  leverage: '5',
  netFundingSinceNeutral: '-0.12',
  returnOnEquity: '0.0386',
  ...overrides,
})

describe('mapPosition', () => {
  it('maps a long Ondo position to the generic Position shape', () => {
    expect(mapPosition(positionFixture(), MARKET)).toEqual({
      market: MARKET,
      side: PositionSide.LONG,
      size: '10',
      entryPrice: '200.5',
      markPrice: '202.05',
      liquidationPrice: '182.3',
      unrealizedPnl: '15.5',
      accruedFunding: '-0.12',
      leverage: '5',
      marginUsed: '401',
      initialMarginRequirement: '401',
      marginMode: MarginMode.CROSS,
    })
  })

  it('maps a short position and takes the size magnitude', () => {
    const mapped = mapPosition(
      positionFixture({ direction: 'short', netQuantity: '-2.5' }),
      MARKET
    )
    expect(mapped?.side).toBe(PositionSide.SHORT)
    expect(mapped?.size).toBe('2.5')
  })

  // Ondo already signs funding from the account's point of view, so
  // `netFundingSinceNeutral` passes through unchanged.
  it.each([
    '-0.12',
    '4.75',
    '0',
  ])('passes netFundingSinceNeutral %s through to accruedFunding', (netFundingSinceNeutral) => {
    expect(
      mapPosition(positionFixture({ netFundingSinceNeutral }), MARKET)
        ?.accruedFunding
    ).toBe(netFundingSinceNeutral)
  })

  it('keeps fractional leverage as the venue string', () => {
    expect(
      mapPosition(positionFixture({ leverage: '3.70' }), MARKET)?.leverage
    ).toBe('3.70')
  })

  it('spells out an exponent-form netQuantity as the size magnitude', () => {
    expect(
      mapPosition(
        positionFixture({ direction: 'short', netQuantity: '-2.5e1' }),
        MARKET
      )?.size
    ).toBe('25')
  })

  it.each([
    'abc',
    '',
    '1,0',
  ])('skips the row and warns once when netQuantity is %j', (netQuantity) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(
      mapPosition(positionFixture({ netQuantity }), MARKET)
    ).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `[ondo] skipping position row: \`netQuantity\` is not a valid decimal: '${netQuantity}'`
      )
    )
    warn.mockRestore()
  })

  it.each([
    ['leverage', { leverage: 'n/a' }],
    ['entryPrice', { averageEntryPrice: 'x' }],
    ['markPrice', { markPrice: '' }],
    ['liquidationPrice', { liquidationPrice: 'NaN' }],
    ['unrealizedPnl', { unrealizedPnl: '1,0' }],
    ['accruedFunding', { netFundingSinceNeutral: '?' }],
    ['marginUsed', { usedMargin: 'none' }],
  ] as const)('keeps the row with the raw venue string when %s is invalid', (field, overrides) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const [value] = Object.values(overrides)

    const mapped = mapPosition(positionFixture(overrides), MARKET)
    expect(mapped?.size).toBe('10')
    expect(mapped?.[field]).toBe(value)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('mapOpenPositions', () => {
  it('drops neutral and zero-quantity rows', () => {
    const rows = [
      positionFixture(),
      positionFixture({
        market: 'TSLA-USD.P',
        direction: 'neutral',
        netQuantity: '0',
      }),
      positionFixture({ market: 'NVDA-USD.P', netQuantity: '0' }),
    ]
    const mapped = mapOpenPositions(rows, () => MARKET)
    expect(mapped).toHaveLength(1)
    expect(mapped[0]?.size).toBe('10')
  })

  it('resolves each market through the provided resolver', () => {
    const seen: string[] = []
    mapOpenPositions([positionFixture()], (market) => {
      seen.push(market)
      return MARKET
    })
    expect(seen).toEqual(['AAPL-USD.P'])
  })
})

describe('isOpenPosition', () => {
  it.each([
    '0',
    '0.0',
    '-0',
  ])('gives false for a zero netQuantity %j', (netQuantity) => {
    expect(isOpenPosition(positionFixture({ netQuantity }))).toBe(false)
  })

  it('gives false for a neutral row with a non-zero netQuantity', () => {
    expect(
      isOpenPosition(
        positionFixture({ direction: 'neutral', netQuantity: '1' })
      )
    ).toBe(false)
  })

  it.each([
    '10',
    '-0.5',
    '0.00000000000000000001',
    '10oops',
  ])('gives true for netQuantity %j', (netQuantity) => {
    expect(isOpenPosition(positionFixture({ netQuantity }))).toBe(true)
  })
})
