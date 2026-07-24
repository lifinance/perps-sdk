import type {
  AccountResponse,
  Asset,
  Balance,
  Position,
} from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { summarizeAccount } from './accountSummary.js'

const USDC: Asset = {
  providerId: 'hyperliquid',
  id: 'USDC',
  displaySymbol: 'USDC',
  logoURI: 'https://x/usdc.png',
}

const balance = (valueUsd: string): Balance => ({
  categoryId: 'hyperliquid',
  asset: USDC,
  units: valueUsd,
  valueUsd,
})

const weighted = (valueUsd: string, collateralWeight: number): Balance => ({
  ...balance(valueUsd),
  collateralWeight,
})

const position = (marginUsed: string, unrealizedPnl: string): Position => ({
  market: {
    providerId: 'hyperliquid',
    id: 'BTC',
    categoryId: 'hyperliquid',
    baseAsset: { ...USDC, id: 'BTC', displaySymbol: 'BTC' },
    quoteAsset: USDC,
  },
  side: PositionSide.LONG,
  size: '1',
  entryPrice: '100',
  markPrice: '110',
  liquidationPrice: '50',
  unrealizedPnl,
  leverage: 10,
  marginUsed,
  marginMode: MarginMode.CROSS,
})

const account = (
  collateralBalances: Balance[],
  balances: Balance[] = []
): AccountResponse => ({
  provider: 'hyperliquid',
  address: '0x0000000000000000000000000000000000000001',
  balances,
  collateralBalances,
  positions: [],
  marginUsed: '0',
  unrealizedPnl: '0',
  feeTier: { maker: '0', taker: '0' },
  config: { provider: 'hyperliquid', abstractionMode: null, agents: [] },
})

describe('summarizeAccount', () => {
  describe("'free' collateral", () => {
    it('reports collateral as available margin and adds locked margin back for gross', () => {
      const summary = summarizeAccount(
        account([balance('800')]),
        [position('200', '50')],
        'free'
      )
      expect(summary.availableMargin).toBe('800')
      expect(summary.marginUsed).toBe('200')
      expect(summary.unrealizedPnl).toBe('50')
      // portfolio = free collateral 800 + locked margin 200 + pnl 50
      expect(summary.portfolioValue).toBe('1050')
    })

    it('adds non-collateral balances to portfolio value only', () => {
      const summary = summarizeAccount(
        account([balance('800')], [balance('250')]),
        [position('200', '0')],
        'free'
      )
      expect(summary.availableMargin).toBe('800')
      expect(summary.portfolioValue).toBe('1250')
    })
  })

  describe("'net' collateral", () => {
    it('adds locked margin back without re-adding unrealized PnL', () => {
      const summary = summarizeAccount(
        account([balance('800')]),
        [position('200', '50')],
        'net'
      )
      expect(summary.availableMargin).toBe('800')
      expect(summary.marginUsed).toBe('200')
      expect(summary.unrealizedPnl).toBe('50')
      // portfolio = net collateral 800 (pnl already in) + locked margin 200
      expect(summary.portfolioValue).toBe('1000')
    })
  })

  describe("'gross' collateral", () => {
    it('adds profit uPnL to available margin: buying power = gross − margin + pnl', () => {
      const summary = summarizeAccount(
        account([balance('10000')]),
        [position('940', '100')],
        'gross'
      )
      expect(summary.availableMargin).toBe('9160')
      expect(summary.portfolioValue).toBe('10100')
      expect(summary.marginUsed).toBe('940')
      expect(summary.unrealizedPnl).toBe('100')
    })

    it('subtracts loss uPnL from available margin so buying power is not overstated', () => {
      const summary = summarizeAccount(
        account([balance('10000')]),
        [position('940', '-100')],
        'gross'
      )
      expect(summary.availableMargin).toBe('8960')
      expect(summary.portfolioValue).toBe('9900')
      expect(summary.marginUsed).toBe('940')
      expect(summary.unrealizedPnl).toBe('-100')
    })
  })

  describe("'equity' collateral", () => {
    it('adds nothing on top: margin and pnl are already embedded', () => {
      // cash 1000, locked margin 100, uPnL +50 → equity rows sum to 1050
      const summary = summarizeAccount(
        account([balance('1050')]),
        [position('100', '50')],
        'equity'
      )
      expect(summary.availableMargin).toBe('950')
      expect(summary.portfolioValue).toBe('1050')
      expect(summary.marginUsed).toBe('100')
      expect(summary.unrealizedPnl).toBe('50')
    })

    it('does not overstate available margin when the embedded pnl is negative', () => {
      // cash 1000, locked margin 100, uPnL -200 → equity rows sum to 800
      const summary = summarizeAccount(
        account([balance('800')]),
        [position('100', '-200')],
        'equity'
      )
      expect(summary.availableMargin).toBe('700')
      expect(summary.portfolioValue).toBe('800')
    })

    it('adds non-collateral balances to portfolio value only', () => {
      const summary = summarizeAccount(
        account([balance('1050')], [balance('250')]),
        [position('100', '50')],
        'equity'
      )
      expect(summary.availableMargin).toBe('950')
      expect(summary.portfolioValue).toBe('1300')
    })
  })

  describe('collateral weight (loan-to-value haircut)', () => {
    it('counts a weighted row at its LTV toward available margin, full value toward portfolio', () => {
      const summary = summarizeAccount(
        account([balance('1000'), weighted('2000', 0.5)]),
        [position('200', '100')],
        'gross'
      )
      // available margin: 1000 + 2000*0.5 + uPnL 100 − margin 200 = 1900
      expect(summary.availableMargin).toBe('1900')
      // portfolio value uses full collateral: 3000 + uPnL 100 = 3100
      expect(summary.portfolioValue).toBe('3100')
    })

    it('treats an absent weight as full value', () => {
      const withWeight = summarizeAccount(
        account([weighted('1000', 1)]),
        [position('100', '0')],
        'gross'
      )
      const withoutWeight = summarizeAccount(
        account([balance('1000')]),
        [position('100', '0')],
        'gross'
      )
      expect(withWeight).toEqual(withoutWeight)
    })
  })

  it('aggregates margin used and pnl across multiple positions', () => {
    const summary = summarizeAccount(
      account([balance('1000')]),
      [position('100', '10'), position('150', '-30')],
      'free'
    )
    expect(summary.marginUsed).toBe('250')
    expect(summary.unrealizedPnl).toBe('-20')
    expect(summary.availableMargin).toBe('1000')
  })

  it('returns string scalars for an empty account', () => {
    expect(summarizeAccount(account([]), [], 'free')).toEqual({
      portfolioValue: '0',
      availableMargin: '0',
      marginUsed: '0',
      unrealizedPnl: '0',
    })
  })
})
