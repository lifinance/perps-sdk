import { MarginMode, type Position, PositionSide } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { removableMargin } from './transferMargin.js'

/** $10,000 notional (2 units at $5,000) unless overridden. */
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

describe('removableMargin', () => {
  it('holds back 10% of notional above 10x', () => {
    // 20x: initial margin is $500 but the floor keeps $1,000 back.
    expect(
      removableMargin(position({ leverage: 20, marginUsed: '1500' }))
    ).toBe('500')
  })

  it('holds back the initial margin below 10x', () => {
    // 5x: $2,000 initial margin exceeds the $1,000 floor.
    expect(removableMargin(position({ leverage: 5, marginUsed: '2500' }))).toBe(
      '500'
    )
  })

  it('has both terms coincide at 10x', () => {
    expect(
      removableMargin(position({ leverage: 10, marginUsed: '1500' }))
    ).toBe('500')
  })

  it('returns zero for a position with no buffer over the requirement', () => {
    expect(
      removableMargin(position({ leverage: 10, marginUsed: '1000' }))
    ).toBe('0')
  })

  it('counts unrealized PnL, which marginUsed already carries', () => {
    // A $400 gain on the 20x position lifts equity to $1,900 over the $1,000
    // floor.
    expect(
      removableMargin(
        position({ leverage: 20, marginUsed: '1900', unrealizedPnl: '400' })
      )
    ).toBe('900')
  })
})
