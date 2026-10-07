import {
  MarginMode,
  PerpsErrorCode,
  type Position,
  PositionMarginAdjustment,
  PositionSide,
} from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
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
  leverage: '20',
  marginUsed: '500',
  initialMarginRequirement: '500',
  marginMode: MarginMode.ISOLATED,
})

describe('perpsTotals', () => {
  it('returns zero totals for an account with no perps sub-dex', () => {
    const { accountValue, marginUsed } = perpsTotals([])
    expect(accountValue).toBe('0')
    expect(marginUsed).toBe('0')
  })

  it('returns the venue figures of a single sub-dex unchanged', () => {
    const { accountValue, marginUsed } = perpsTotals([
      dexState('1234.56', '789.01'),
    ])
    expect(accountValue).toBe('1234.56')
    expect(marginUsed).toBe('789.01')
  })

  it('sums the venue figures over every sub-dex', () => {
    const { accountValue, marginUsed } = perpsTotals([
      dexState('1000', '400'),
      dexState('250', '100'),
      dexState('7.5', '2.5'),
    ])
    expect(accountValue).toBe('1257.5')
    expect(marginUsed).toBe('502.5')
  })

  it('keeps full decimal precision, unlike a float sum', () => {
    const { accountValue } = perpsTotals([
      dexState('0.1', '0'),
      dexState('0.2', '0'),
    ])
    expect(accountValue).toBe('0.3')
  })

  it.each([
    ['accountValue', dexState('n/a', '0')],
    ['totalMarginUsed', dexState('1', '')],
  ])('throws an SDKError when %s is not a decimal', (_field, state) => {
    expect(() => perpsTotals([state])).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.SDKError })
    )
  })

  it('skips a sub-dex that carries no marginSummary', () => {
    const { accountValue, marginUsed } = perpsTotals([
      dexState('1000', '400'),
      {},
    ])
    expect(accountValue).toBe('1000')
    expect(marginUsed).toBe('400')
  })
})

describe('sumUnrealizedPnl', () => {
  it('returns zero for an account with no position', () => {
    expect(sumUnrealizedPnl([])).toBe('0')
  })

  it('adds a profit and a loss at full decimal precision', () => {
    expect(
      sumUnrealizedPnl([position('0.1'), position('0.2'), position('-0.05')])
    ).toBe('0.25')
  })

  it('skips a term that does not match the decimal pattern, sums the rest and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      sumUnrealizedPnl([position('0.1'), position('NaN'), position('0.2')])
    ).toBe('0.3')
    expect(sumUnrealizedPnl([position('abc')])).toBe('0')
    expect(warn).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith(
      "[hyperliquid] skipping a `position.unrealizedPnl` term that does not match the decimal pattern: 'NaN'"
    )
    warn.mockRestore()
  })
})
