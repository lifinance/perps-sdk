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
  marginUsed: '0',
  unrealizedPnl: '0',
  feeTier: { maker: '0', taker: '0' },
  config: { provider: 'hyperliquid', abstractionMode: null, agents: [] },
})

describe('summarizeAccount', () => {
  describe('free collateral (collateralIsGross: false)', () => {
    it('reports collateral as available margin and adds locked margin back for gross', () => {
      const summary = summarizeAccount(
        account([balance('800')]),
        [position('200', '50')],
        false
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
        false
      )
      expect(summary.availableMargin).toBe('800')
      expect(summary.portfolioValue).toBe('1250')
    })
  })

  describe('gross collateral (collateralIsGross: true)', () => {
    it('subtracts margin used to reach available margin', () => {
      const summary = summarizeAccount(
        account([balance('10000')]),
        [position('940', '100')],
        true
      )
      expect(summary.availableMargin).toBe('9060')
      expect(summary.portfolioValue).toBe('10100')
      expect(summary.marginUsed).toBe('940')
      expect(summary.unrealizedPnl).toBe('100')
    })
  })

  it('aggregates margin used and pnl across multiple positions', () => {
    const summary = summarizeAccount(
      account([balance('1000')]),
      [position('100', '10'), position('150', '-30')],
      false
    )
    expect(summary.marginUsed).toBe('250')
    expect(summary.unrealizedPnl).toBe('-20')
    expect(summary.availableMargin).toBe('1000')
  })

  it('returns string scalars for an empty account', () => {
    expect(summarizeAccount(account([]), [], false)).toEqual({
      portfolioValue: '0',
      availableMargin: '0',
      marginUsed: '0',
      unrealizedPnl: '0',
    })
  })
})
