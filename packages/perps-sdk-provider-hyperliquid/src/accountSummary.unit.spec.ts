import type {
  AccountResponse,
  Asset,
  Balance,
  Position,
} from '@lifi/perps-types'
import {
  MarginMode,
  PositionMarginAdjustment,
  PositionSide,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { getAccountSummary } from './accountSummary.js'
import { HlAbstractionMode } from './types/index.js'

const USDC: Asset = {
  providerId: 'hyperliquid',
  id: 'USDC',
  displaySymbol: 'USDC',
  logoURI: 'https://app.hyperliquid.xyz/coins/USDC.svg',
}

const balance = (categoryId: string, valueUsd: string): Balance => ({
  categoryId,
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
    positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
  },
  side: PositionSide.LONG,
  size: '1',
  entryPrice: '100',
  markPrice: '110',
  liquidationPrice: '50',
  unrealizedPnl,
  leverage: 10,
  marginUsed,
  initialMarginRequirement: marginUsed,
  marginMode: MarginMode.CROSS,
})

const account = (
  abstractionMode: HlAbstractionMode | null,
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
  config: { provider: 'hyperliquid', abstractionMode, agents: [] },
})

describe('getAccountSummary', () => {
  // Standard (unset), disabled and dexAbstraction modes: venue collateral rows
  // hold `accountValue` = total venue equity, which already includes locked
  // margin AND unrealized PnL — nothing may be added back on top of it.
  describe.each([
    ['standard (null abstraction)', null],
    ['disabled', HlAbstractionMode.DISABLED],
    ['dexAbstraction', HlAbstractionMode.DEX_ABSTRACTION],
  ])('non-unified mode: %s', (_label, mode) => {
    it('does not double-count marginUsed or unrealized pnl embedded in accountValue', () => {
      // Deposit 1000, open a position locking 100 margin, uPnL +50:
      // HL reports accountValue 1050 (equity = cash 1000 + uPnL 50).
      const summary = getAccountSummary(
        account(mode as HlAbstractionMode | null, [
          balance('hyperliquid', '1050'),
        ]),
        [position('100', '50')]
      )
      // free margin = equity − locked margin, NOT equity itself
      expect(summary.availableMargin).toBe('950')
      // portfolio = equity as-is; adding marginUsed/uPnL would double-count
      expect(summary.portfolioValue).toBe('1050')
      expect(summary.marginUsed).toBe('100')
      expect(summary.unrealizedPnl).toBe('50')
    })

    it('sums spot collateral (cash) and venue equity rows', () => {
      const summary = getAccountSummary(
        account(mode as HlAbstractionMode | null, [
          balance('spot', '500'),
          balance('hyperliquid', '10000'),
        ]),
        [position('940', '100')]
      )
      expect(summary.availableMargin).toBe('9560')
      expect(summary.portfolioValue).toBe('10500')
      expect(summary.marginUsed).toBe('940')
      expect(summary.unrealizedPnl).toBe('100')
    })

    it('adds non-collateral balances to portfolio value only', () => {
      const summary = getAccountSummary(
        account(
          mode as HlAbstractionMode | null,
          [balance('hyperliquid', '1000')],
          [balance('spot', '250')]
        ),
        [position('200', '0')]
      )
      // available = venue equity 1000 − locked margin 200
      expect(summary.availableMargin).toBe('800')
      // portfolio = balances 250 + venue equity 1000
      expect(summary.portfolioValue).toBe('1250')
    })
  })

  // Unified/portfolio-margin modes: spot holds the whole account as gross
  // collateral (locked margin included, unrealized PnL carried by the
  // positions). HL counts cross-position uPnL toward buying power, so
  // available margin = spot collateral − locked margin + uPnL.
  describe.each([
    ['unifiedAccount', HlAbstractionMode.UNIFIED_ACCOUNT],
    ['portfolioMargin', HlAbstractionMode.PORTFOLIO_MARGIN],
  ])('unified mode: %s', (_label, mode) => {
    it('adds profit uPnL to available margin on top of gross spot collateral', () => {
      const summary = getAccountSummary(
        account(mode, [balance('spot', '10000')]),
        [position('940', '100')]
      )
      expect(summary.availableMargin).toBe('9160')
      expect(summary.portfolioValue).toBe('10100')
      expect(summary.marginUsed).toBe('940')
      expect(summary.unrealizedPnl).toBe('100')
    })

    it('subtracts loss uPnL from available margin so buying power is not overstated', () => {
      const summary = getAccountSummary(
        account(mode, [balance('spot', '10000')]),
        [position('940', '-100')]
      )
      expect(summary.availableMargin).toBe('8960')
      expect(summary.portfolioValue).toBe('9900')
      expect(summary.marginUsed).toBe('940')
      expect(summary.unrealizedPnl).toBe('-100')
    })
  })

  it('aggregates margin used and pnl across multiple positions', () => {
    const summary = getAccountSummary(
      account(null, [balance('hyperliquid', '1000')]),
      [position('100', '10'), position('150', '-30')]
    )
    expect(summary.marginUsed).toBe('250')
    expect(summary.unrealizedPnl).toBe('-20')
    // non-unified: available = venue equity 1000 − aggregate locked margin 250
    expect(summary.availableMargin).toBe('750')
  })

  it('returns string scalars for an empty account', () => {
    const summary = getAccountSummary(account(null, []), [])
    expect(summary).toEqual({
      portfolioValue: '0',
      availableMargin: '0',
      marginUsed: '0',
      unrealizedPnl: '0',
    })
  })
})
