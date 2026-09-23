import {
  MarginMode,
  type Position,
  PositionMarginAdjustment,
  PositionSide,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { positionRemovableMargin } from './transferMargin.js'

const position = (overrides: Partial<Position> = {}): Position => ({
  market: {
    providerId: 'lighter',
    id: '0',
    categoryId: 'perps',
    baseAsset: {
      providerId: 'lighter',
      id: '0',
      displaySymbol: 'ETH',
      logoURI: '',
    },
    quoteAsset: {
      providerId: 'lighter',
      id: '1',
      displaySymbol: 'USDC',
      logoURI: '',
    },
    positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
  },
  side: PositionSide.LONG,
  size: '2',
  entryPrice: '5000',
  markPrice: '5000',
  liquidationPrice: '4000',
  unrealizedPnl: '0',
  accruedFunding: '0',
  leverage: 100 / 45,
  marginUsed: '1500',
  initialMarginRequirement: '450.000045',
  marginMode: MarginMode.ISOLATED,
  ...overrides,
})

describe('positionRemovableMargin', () => {
  it('retains the provider-normalized fractional-IMF requirement', () => {
    expect(positionRemovableMargin(position())).toBe('1049.999955')
  })

  it.each([
    ['profit', '400', '1449.999955'],
    ['loss', '-600', '449.999955'],
  ])('adds the unrealized PnL of a position with a %s to allocated margin', (_label, unrealizedPnl, expected) => {
    expect(positionRemovableMargin(position({ unrealizedPnl }))).toBe(expected)
  })

  it('rounds down to the six-decimal venue amount increment', () => {
    expect(
      positionRemovableMargin(position({ unrealizedPnl: '0.00000099' }))
    ).toBe('1049.999955')
  })

  it('returns zero when equity is at or below the retained requirement', () => {
    expect(positionRemovableMargin(position({ unrealizedPnl: '-1100' }))).toBe(
      '0'
    )
  })

  it('returns zero for an add-only market', () => {
    expect(
      positionRemovableMargin(
        position({
          market: {
            ...position().market,
            positionMarginAdjustment: PositionMarginAdjustment.ADD_ONLY,
          },
        })
      )
    ).toBe('0')
  })

  it('returns undefined for a cross position', () => {
    expect(
      positionRemovableMargin(position({ marginMode: MarginMode.CROSS }))
    ).toBeUndefined()
  })

  it.each([
    '0',
    '-1',
    'n/a',
  ])('rejects invalid isolated minimum margin %s', (initialMarginRequirement) => {
    expect(() =>
      positionRemovableMargin(position({ initialMarginRequirement }))
    ).toThrowError()
  })

  it.each([
    ['marginUsed', { marginUsed: '0' }],
    ['unrealizedPnl', { unrealizedPnl: 'n/a' }],
  ] as const)('rejects invalid Position.%s', (_field, overrides) => {
    expect(() => positionRemovableMargin(position(overrides))).toThrowError()
  })
})
