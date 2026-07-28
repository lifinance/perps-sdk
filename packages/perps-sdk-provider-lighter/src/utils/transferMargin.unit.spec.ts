import { MarginMode, type Position, PositionSide } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { removableMargin } from './transferMargin.js'

/** $10,000 notional (2 units at $5,000) unless overridden. */
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
  it('holds back only the initial margin above 10x', () => {
    // No notional floor: 20x needs $500 back, unlike Hyperliquid's $1,000.
    expect(
      removableMargin(position({ leverage: 20, marginUsed: '1500' }))
    ).toBe('1000')
  })

  it('holds back the initial margin below 10x', () => {
    expect(removableMargin(position({ leverage: 5, marginUsed: '2500' }))).toBe(
      '500'
    )
  })

  it('holds back the initial margin at 10x', () => {
    expect(
      removableMargin(position({ leverage: 10, marginUsed: '1500' }))
    ).toBe('500')
  })

  it('returns zero for a position with no buffer over the requirement', () => {
    expect(removableMargin(position({ leverage: 20, marginUsed: '500' }))).toBe(
      '0'
    )
  })
})
