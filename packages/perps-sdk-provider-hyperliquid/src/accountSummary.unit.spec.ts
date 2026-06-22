import type {
  AccountResponse,
  Asset,
  Balance,
  Position,
} from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
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
  abstractionMode: HlAbstractionMode | null,
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
  config: { provider: 'hyperliquid', abstractionMode, agents: [] },
})

describe('getAccountSummary', () => {
  // Standard (unset) and disabled modes: venue collateral rows are free margin
  // (accountValue is net of locked margin), so margin is added back for gross.
  describe.each([
    ['standard (null abstraction)', null],
    ['disabled', HlAbstractionMode.DISABLED],
    ['dexAbstraction', HlAbstractionMode.DEX_ABSTRACTION],
  ])('non-unified mode: %s', (_label, mode) => {
    it('treats collateral rows as free; available margin equals total collateral', () => {
      // spot USDC 500 (free) + venue equity 10000 (free) = 10500 free
      const summary = getAccountSummary(
        account(mode as HlAbstractionMode | null, [
          balance('spot', '500'),
          balance('hyperliquid', '10000'),
        ]),
        [position('940', '100')]
      )
      // free collateral is shown as available, untouched by marginUsed
      expect(summary.availableMargin).toBe('10500')
      // gross = free + locked margin; portfolio adds unrealized pnl
      expect(summary.portfolioValue).toBe('11540')
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
      // available = free collateral only (1000), not the non-collateral 250
      expect(summary.availableMargin).toBe('1000')
      // portfolio = balances 250 + gross collateral (1000 + 200) + pnl 0
      expect(summary.portfolioValue).toBe('1450')
    })
  })

  // Unified/portfolio-margin modes: spot holds the whole account, so collateral
  // rows are already gross — margin must be subtracted to reach free.
  describe.each([
    ['unifiedAccount', HlAbstractionMode.UNIFIED_ACCOUNT],
    ['portfolioMargin', HlAbstractionMode.PORTFOLIO_MARGIN],
  ])('unified mode: %s', (_label, mode) => {
    it('treats collateral as gross; available margin subtracts margin used', () => {
      const summary = getAccountSummary(
        account(mode, [balance('spot', '10000')]),
        [position('940', '100')]
      )
      expect(summary.availableMargin).toBe('9060')
      expect(summary.portfolioValue).toBe('10100')
      expect(summary.marginUsed).toBe('940')
      expect(summary.unrealizedPnl).toBe('100')
    })
  })

  it('aggregates margin used and pnl across multiple positions', () => {
    const summary = getAccountSummary(
      account(null, [balance('hyperliquid', '1000')]),
      [position('100', '10'), position('150', '-30')]
    )
    expect(summary.marginUsed).toBe('250')
    expect(summary.unrealizedPnl).toBe('-20')
    // non-unified: available = free collateral (1000)
    expect(summary.availableMargin).toBe('1000')
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
