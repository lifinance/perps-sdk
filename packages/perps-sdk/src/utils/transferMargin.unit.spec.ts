import {
  MarginMode,
  PerpsErrorCode,
  type Position,
  PositionMarginAdjustment,
  type PositionMarginConstraints,
  PositionSide,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { PerpsError } from '../errors/PerpsError.js'
import { removableIsolatedMargin } from './transferMargin.js'

const position = (overrides: Partial<Position> = {}): Position => ({
  market: {
    providerId: 'test',
    id: 'ETH',
    categoryId: 'perps',
    baseAsset: {
      providerId: 'test',
      id: 'ETH',
      displaySymbol: 'ETH',
      logoURI: '',
    },
    quoteAsset: {
      providerId: 'test',
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
  leverage: 20,
  marginUsed: '1500',
  initialMarginRequirement: '500',
  marginMode: MarginMode.ISOLATED,
  ...overrides,
})

const constraints = (
  overrides: Partial<PositionMarginConstraints> = {}
): PositionMarginConstraints => ({
  minimumMarginRequirement: '500',
  amountIncrement: '0.000001',
  ...overrides,
})

describe('removableIsolatedMargin', () => {
  it('retains the provider minimum margin requirement', () => {
    expect(
      removableIsolatedMargin({
        position: position(),
        constraints: constraints({ minimumMarginRequirement: '1000' }),
      })
    ).toBe('500')
  })

  it('uses the exact provider initial-margin requirement, not display leverage', () => {
    expect(
      removableIsolatedMargin({
        position: position({
          leverage: 50,
          marginUsed: '4500',
          initialMarginRequirement: '4000',
        }),
        constraints: constraints({ minimumMarginRequirement: '4000' }),
      })
    ).toBe('500')
  })

  it.each([
    ['positive', '400', '1400'],
    ['negative', '-600', '400'],
  ])('includes %s unrealized PnL in position equity', (_label, pnl, expected) => {
    expect(
      removableIsolatedMargin({
        position: position({ unrealizedPnl: pnl }),
        constraints: constraints(),
      })
    ).toBe(expected)
  })

  it('snaps removable margin down to the provider wire increment', () => {
    expect(
      removableIsolatedMargin({
        position: position({
          size: '1',
          markPrice: '1',
          marginUsed: '1.23456889',
          initialMarginRequirement: '0.000001',
        }),
        constraints: constraints({ minimumMarginRequirement: '0.000001' }),
      })
    ).toBe('1.234567')
  })

  it.each([
    PositionMarginAdjustment.ADD_ONLY,
    PositionMarginAdjustment.NONE,
  ])('does not remove margin when the market capability is %s', (capability) => {
    expect(
      removableIsolatedMargin({
        position: position({
          market: {
            ...position().market,
            positionMarginAdjustment: capability,
          },
        }),
        constraints: constraints(),
      })
    ).toBe('0')
  })

  it('does not remove margin from a cross position', () => {
    expect(
      removableIsolatedMargin({
        position: position({ marginMode: MarginMode.CROSS }),
        constraints: constraints(),
      })
    ).toBe('0')
  })

  it('returns zero when equity is below the retained requirement', () => {
    expect(
      removableIsolatedMargin({
        position: position({ marginUsed: '300', unrealizedPnl: '-100' }),
        constraints: constraints(),
      })
    ).toBe('0')
  })

  it('rejects malformed exact inputs', () => {
    expect(() =>
      removableIsolatedMargin({
        position: position({ unrealizedPnl: 'n/a' }),
        constraints: constraints(),
      })
    ).toThrow(
      new PerpsError(
        PerpsErrorCode.ValidationError,
        `Invalid decimal string on Position.unrealizedPnl: 'n/a'`
      )
    )
  })

  it.each([
    '0',
    '-1',
    'n/a',
  ])('rejects invalid provider minimum margin %s', (minimumMarginRequirement) => {
    expect(() =>
      removableIsolatedMargin({
        position: position(),
        constraints: constraints({ minimumMarginRequirement }),
      })
    ).toThrow(PerpsError)
  })

  it('rejects a non-positive wire increment', () => {
    expect(() =>
      removableIsolatedMargin({
        position: position(),
        constraints: constraints({ amountIncrement: '0' }),
      })
    ).toThrow(PerpsError)
  })
})
