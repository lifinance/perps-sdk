import {
  MarginMode,
  PerpsErrorCode,
  type Position,
  PositionMarginAdjustment,
  PositionSide,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { HlAssetPosition } from '../types/index.js'
import { mapPosition } from './mapPosition.js'
import { positionRemovableMargin } from './transferMargin.js'

const position = (overrides: Partial<Position> = {}): Position => ({
  market: {
    providerId: 'hyperliquid',
    id: 'ETH',
    categoryId: '',
    baseAsset: {
      providerId: 'hyperliquid',
      id: 'ETH',
      displaySymbol: 'ETH',
      logoURI: '',
    },
    quoteAsset: {
      providerId: 'hyperliquid',
      id: 'USDC',
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
  leverage: '20',
  marginUsed: '500',
  initialMarginRequirement: '500',
  marginMode: MarginMode.ISOLATED,
  ...overrides,
})

describe('positionRemovableMargin', () => {
  it('retains the notional floor when it exceeds initial margin', () => {
    expect(positionRemovableMargin(position({ marginUsed: '1500' }))).toBe(
      '500'
    )
  })

  const isolatedWithPnl = (): Position => {
    const mapped = mapPosition(
      {
        position: {
          coin: 'ETH',
          szi: '2',
          entryPx: '5000',
          positionValue: '10000',
          liquidationPx: '4000',
          unrealizedPnl: '100',
          // Hyperliquid reports isolated equity here, including the PnL.
          marginUsed: '1500',
          leverage: { type: 'isolated', value: 20 },
          cumFunding: {
            allTime: '-23403.892773',
            sinceOpen: '5.788917',
            sinceChange: '0.0',
          },
        },
      } satisfies HlAssetPosition,
      position().market
    )
    if (mapped === undefined) {
      throw new Error('expected a mapped position')
    }
    return mapped
  }

  it('reports the venue isolated marginUsed unchanged', () => {
    expect(isolatedWithPnl().marginUsed).toBe('1500')
  })

  it('removes isolated equity down to the venue minimum', () => {
    expect(positionRemovableMargin(isolatedWithPnl())).toBe('500')
  })

  it('retains initial margin when it exceeds the notional floor', () => {
    expect(
      positionRemovableMargin(
        position({
          marginUsed: '2000',
          initialMarginRequirement: '1500.0000001',
        })
      )
    ).toBe('499.999999')
  })

  it('rounds down to the six-decimal venue amount increment', () => {
    expect(
      positionRemovableMargin(position({ marginUsed: '1000.12345689' }))
    ).toBe('0.123456')
  })

  it('returns zero when equity is at or below the retained requirement', () => {
    expect(positionRemovableMargin(position({ marginUsed: '1000' }))).toBe('0')
    expect(positionRemovableMargin(position({ marginUsed: '900' }))).toBe('0')
  })

  it.each([
    '0',
    '-50',
  ])('returns zero when isolated equity marginUsed is %s', (marginUsed) => {
    expect(positionRemovableMargin(position({ marginUsed }))).toBe('0')
  })

  it('returns zero for an add-only strict-isolated market', () => {
    expect(
      positionRemovableMargin(
        position({
          marginUsed: '1500',
          market: {
            ...position().market,
            positionMarginAdjustment: PositionMarginAdjustment.ADD_ONLY,
          },
        })
      )
    ).toBe('0')
  })

  it('returns undefined for cross positions and unsupported markets', () => {
    expect(
      positionRemovableMargin(position({ marginMode: MarginMode.CROSS }))
    ).toBeUndefined()
    expect(
      positionRemovableMargin(
        position({
          market: {
            ...position().market,
            positionMarginAdjustment: PositionMarginAdjustment.NONE,
          },
        })
      )
    ).toBeUndefined()
  })

  it.each([
    ['marginUsed', { marginUsed: 'n/a' }],
    ['marginUsed', { marginUsed: '1e-8' }],
    ['size', { size: '0' }],
    ['markPrice', { markPrice: '-1' }],
    ['initialMarginRequirement', { initialMarginRequirement: 'n/a' }],
  ] as const)('rejects invalid Position.%s', (_field, overrides) => {
    expect(() => positionRemovableMargin(position(overrides))).toThrowError(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })

  it.each([
    [
      { marginUsed: 'n/a' },
      "Invalid `Position.marginUsed`: 'n/a' does not match the decimal pattern.",
    ],
    [
      { initialMarginRequirement: 'n/a' },
      "Invalid `Position.initialMarginRequirement`: 'n/a' does not match the decimal pattern.",
    ],
    [{ size: '0' }, 'Position.size must be greater than zero.'],
    [{ markPrice: '-1' }, 'Position.markPrice must be greater than zero.'],
  ] as const)('throws a ValidationError with the message for %o', (overrides, message) => {
    expect(() => positionRemovableMargin(position(overrides))).toThrowError(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError, message })
    )
  })

  it.each([
    'markPrice',
    'initialMarginRequirement',
  ] as const)('throws a ValidationError when Position.%s is absent', (field) => {
    const { [field]: _absent, ...rest } = position()
    expect(() => positionRemovableMargin(rest)).toThrowError(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: `Position.${field} must be greater than zero.`,
      })
    )
  })

  it('names Position.marginUsed when it holds an exponent string', () => {
    expect(() =>
      positionRemovableMargin(position({ marginUsed: '1e-8' }))
    ).toThrowError(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: expect.stringContaining('Position.marginUsed'),
      })
    )
  })
})
