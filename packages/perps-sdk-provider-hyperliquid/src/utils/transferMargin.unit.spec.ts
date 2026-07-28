import { removableIsolatedMargin } from '@lifi/perps-sdk'
import {
  MarginMode,
  type Position,
  PositionMarginAdjustment,
  PositionSide,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { HlAssetPosition } from '../types/index.js'
import { mapPosition } from './mapPosition.js'
import { positionMarginConstraints } from './transferMargin.js'

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
  leverage: 20,
  marginUsed: '500',
  initialMarginRequirement: '500',
  marginMode: MarginMode.ISOLATED,
  ...overrides,
})

describe('positionMarginConstraints', () => {
  it('returns Hyperliquid exact requirements for an isolated position', () => {
    expect(positionMarginConstraints(position())).toEqual({
      minimumMarginRequirement: '1000',
      amountIncrement: '0.000001',
    })
  })

  it('uses isolated equity exactly once when unrealized PnL is non-zero', () => {
    const current = mapPosition(
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
        },
      } satisfies HlAssetPosition,
      position().market
    )
    const constraints = positionMarginConstraints(current)

    expect(current.marginUsed).toBe('1400')
    expect(constraints).toBeDefined()
    expect(
      removableIsolatedMargin({ position: current, constraints: constraints! })
    ).toBe('500')
  })

  it('retains initial margin when it exceeds the notional floor', () => {
    expect(
      positionMarginConstraints(
        position({ initialMarginRequirement: '1500.0000001' })
      )
    ).toEqual({
      minimumMarginRequirement: '1500.0000001',
      amountIncrement: '0.000001',
    })
  })

  it('keeps constraints available for an add-only strict-isolated market', () => {
    expect(
      positionMarginConstraints(
        position({
          market: {
            ...position().market,
            positionMarginAdjustment: PositionMarginAdjustment.ADD_ONLY,
          },
        })
      )
    ).toBeDefined()
  })

  it('returns undefined for cross positions and unsupported markets', () => {
    expect(
      positionMarginConstraints(position({ marginMode: MarginMode.CROSS }))
    ).toBeUndefined()
    expect(
      positionMarginConstraints(
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
    ['size', { size: '0' }],
    ['markPrice', { markPrice: '-1' }],
    ['initialMarginRequirement', { initialMarginRequirement: 'n/a' }],
  ] as const)('rejects invalid Position.%s', (_field, overrides) => {
    expect(() => positionMarginConstraints(position(overrides))).toThrowError()
  })
})
