import {
  MarginMode,
  PerpsErrorCode,
  type Position,
  PositionSide,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { PerpsError } from '../errors/PerpsError.js'
import { removableIsolatedMargin } from './transferMargin.js'

/** $10,000 notional (2 units at $5,000) unless overridden. */
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
  },
  side: PositionSide.LONG,
  size: '2',
  entryPrice: '5000',
  markPrice: '5000',
  liquidationPrice: '4000',
  unrealizedPnl: '0',
  leverage: 10,
  marginUsed: '1500',
  marginMode: MarginMode.ISOLATED,
  ...overrides,
})

describe('removableIsolatedMargin', () => {
  it('binds on the notional floor above 1 / notionalFloorRatio leverage', () => {
    // 20x: initial margin $500, floor $1,000 — the floor requires $1,000 back.
    expect(
      removableIsolatedMargin({
        position: position({ leverage: 20, marginUsed: '1500' }),
        notionalFloorRatio: 0.1,
      })
    ).toBe('500')
  })

  it('binds on the initial margin below 1 / notionalFloorRatio leverage', () => {
    // 5x: initial margin $2,000 exceeds the $1,000 floor.
    expect(
      removableIsolatedMargin({
        position: position({ leverage: 5, marginUsed: '2500' }),
        notionalFloorRatio: 0.1,
      })
    ).toBe('500')
  })

  it('has both terms coincide at 1 / notionalFloorRatio leverage', () => {
    // 10x: initial margin and floor are both $1,000.
    expect(
      removableIsolatedMargin({
        position: position({ leverage: 10, marginUsed: '1500' }),
        notionalFloorRatio: 0.1,
      })
    ).toBe('500')
  })

  it('returns zero for a position with no buffer over the requirement', () => {
    expect(
      removableIsolatedMargin({
        position: position({ leverage: 10, marginUsed: '1000' }),
        notionalFloorRatio: 0.1,
      })
    ).toBe('0')
  })

  it('returns zero when equity is already below the requirement', () => {
    expect(
      removableIsolatedMargin({
        position: position({ leverage: 10, marginUsed: '800' }),
        notionalFloorRatio: 0.1,
      })
    ).toBe('0')
  })

  it('requires the initial margin alone when no notional floor is given', () => {
    // Same 20x position as the floor-binding case: $500 required, not $1,000.
    expect(
      removableIsolatedMargin({
        position: position({ leverage: 20, marginUsed: '1500' }),
      })
    ).toBe('1000')
  })

  it('takes the initial margin at the position leverage, not a market cap', () => {
    // A 2x position on a 50x market keeps $5,000, not $200.
    expect(
      removableIsolatedMargin({
        position: position({ leverage: 2, marginUsed: '5200' }),
        notionalFloorRatio: 0.1,
      })
    ).toBe('200')
  })

  it('rounds a non-terminating requirement so the result under-reports', () => {
    // $10,000 at 3x needs $3,333.33…; rounding up the requirement leaves
    // strictly less than the exact $1,666.66… removable.
    const removable = removableIsolatedMargin({
      position: position({ leverage: 3, marginUsed: '5000' }),
      notionalFloorRatio: 0.1,
    })
    expect(removable).toBe('1666.66666666')
    expect(Number(removable)).toBeLessThan(5000 - 10000 / 3)
  })

  it('returns zero when the position leverage is not positive', () => {
    expect(
      removableIsolatedMargin({
        position: position({ leverage: 0, marginUsed: '1500' }),
        notionalFloorRatio: 0.1,
      })
    ).toBe('0')
  })

  it('treats size as a magnitude', () => {
    expect(
      removableIsolatedMargin({
        position: position({ size: '-2', leverage: 10, marginUsed: '1500' }),
        notionalFloorRatio: 0.1,
      })
    ).toBe('500')
  })

  it('frees the whole margin of a zero-notional position', () => {
    expect(
      removableIsolatedMargin({
        position: position({ size: '0', marginUsed: '1500' }),
        notionalFloorRatio: 0.1,
      })
    ).toBe('1500')
  })

  it('rejects a non-decimal position amount', () => {
    expect(() =>
      removableIsolatedMargin({
        position: position({ markPrice: 'n/a' }),
        notionalFloorRatio: 0.1,
      })
    ).toThrow(
      new PerpsError(
        PerpsErrorCode.ValidationError,
        `Invalid decimal string on Position.markPrice: 'n/a'`
      )
    )
  })
})
