import { removableIsolatedMargin } from '@lifi/perps-sdk'
import {
  MarginMode,
  type Position,
  PositionMarginAdjustment,
  PositionSide,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { positionMarginConstraints } from './transferMargin.js'

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

describe('positionMarginConstraints', () => {
  it('preserves the provider-normalized fractional-IMF requirement', () => {
    expect(positionMarginConstraints(position())).toEqual({
      minimumMarginRequirement: '450.000045',
      amountIncrement: '0.000001',
    })
  })

  it.each([
    ['positive', '400', '1449.999955'],
    ['negative', '-600', '449.999955'],
  ])('bounds removal using allocated margin plus %s PnL', (_label, pnl, expected) => {
    const current = position({ unrealizedPnl: pnl })
    const constraints = positionMarginConstraints(current)

    expect(constraints).toBeDefined()
    expect(
      removableIsolatedMargin({ position: current, constraints: constraints! })
    ).toBe(expected)
  })

  it('returns undefined for a cross position', () => {
    expect(
      positionMarginConstraints(position({ marginMode: MarginMode.CROSS }))
    ).toBeUndefined()
  })

  it.each([
    '0',
    '-1',
    'n/a',
  ])('rejects invalid isolated minimum margin %s', (initialMarginRequirement) => {
    expect(() =>
      positionMarginConstraints(position({ initialMarginRequirement }))
    ).toThrowError()
  })
})
