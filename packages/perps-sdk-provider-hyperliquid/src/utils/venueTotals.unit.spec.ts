import {
  MarginMode,
  type Position,
  PositionMarginAdjustment,
  PositionSide,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import {
  type DexMarginSummary,
  perpsTotals,
  sumUnrealizedPnl,
} from './venueTotals.js'

const dexState = (
  accountValue: string,
  totalMarginUsed: string
): DexMarginSummary => ({
  marginSummary: {
    accountValue,
    totalNtlPos: '0',
    totalRawUsd: accountValue,
    totalMarginUsed,
  },
})

const position = (unrealizedPnl: string): Position => ({
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
  unrealizedPnl,
  accruedFunding: '0',
  leverage: 20,
  marginUsed: '500',
  initialMarginRequirement: '500',
  marginMode: MarginMode.ISOLATED,
})

describe('perpsTotals', () => {
  it('returns zero totals for an account with no perps sub-dex', () => {
    const { accountValue, marginUsed } = perpsTotals([])
    expect(accountValue.toFixed()).toBe('0')
    expect(marginUsed.toFixed()).toBe('0')
  })

  it('returns the venue figures of a single sub-dex unchanged', () => {
    const { accountValue, marginUsed } = perpsTotals([
      dexState('1234.56', '789.01'),
    ])
    expect(accountValue.toFixed()).toBe('1234.56')
    expect(marginUsed.toFixed()).toBe('789.01')
  })

  it('sums the venue figures over every sub-dex', () => {
    const { accountValue, marginUsed } = perpsTotals([
      dexState('1000', '400'),
      dexState('250', '100'),
      dexState('7.5', '2.5'),
    ])
    expect(accountValue.toFixed()).toBe('1257.5')
    expect(marginUsed.toFixed()).toBe('502.5')
  })

  it('keeps full decimal precision, unlike a float sum', () => {
    const { accountValue } = perpsTotals([
      dexState('0.1', '0'),
      dexState('0.2', '0'),
    ])
    expect(accountValue.toFixed()).toBe('0.3')
  })

  it('skips a sub-dex that carries no marginSummary', () => {
    const { accountValue, marginUsed } = perpsTotals([
      dexState('1000', '400'),
      {},
    ])
    expect(accountValue.toFixed()).toBe('1000')
    expect(marginUsed.toFixed()).toBe('400')
  })
})

describe('sumUnrealizedPnl', () => {
  it('returns zero for an account with no position', () => {
    expect(sumUnrealizedPnl([]).toFixed()).toBe('0')
  })

  it('adds a profit and a loss at full decimal precision', () => {
    expect(
      sumUnrealizedPnl([
        position('0.1'),
        position('0.2'),
        position('-0.05'),
      ]).toFixed()
    ).toBe('0.25')
  })
})
