import type {
  AccountResponse,
  Asset,
  Balance,
  Position,
} from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { summarize } from './summarize.js'

const usdc: Asset = {
  providerId: 'hyperliquid',
  id: 'USDC',
  displaySymbol: 'USDC',
  logoURI: 'https://x/usdc.png',
}

const balance = (
  categoryId: string,
  units: string,
  valueUsd: string
): Balance => ({ categoryId, asset: usdc, units, valueUsd })

const market = {
  providerId: 'hyperliquid',
  id: 'BTC',
  categoryId: 'hyperliquid',
  baseAsset: { ...usdc, id: 'BTC', displaySymbol: 'BTC' },
  quoteAsset: usdc,
}

const position = (marginUsed: string, unrealizedPnl: string): Position => ({
  market,
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
  balances: Balance[],
  collateralBalances: Balance[]
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

describe('summarize', () => {
  it('computes available margin from collateral minus margin used', () => {
    const summary = summarize(
      account([], [balance('hyperliquid', '1000', '1000')]),
      [position('200', '50')]
    )
    expect(summary.availableMargin).toBe('800')
    expect(summary.marginUsed).toBe('200')
    expect(summary.unrealizedPnl).toBe('50')
  })

  it('sums non-collateral balances + collateral + unrealized pnl into portfolio value', () => {
    const summary = summarize(
      account(
        [balance('spot', '5', '250')],
        [balance('hyperliquid', '1000', '1000')]
      ),
      [position('200', '50')]
    )
    // 250 (balances) + 1000 (collateral) + 50 (pnl)
    expect(summary.portfolioValue).toBe('1300')
  })

  it('aggregates margin used and pnl across multiple positions', () => {
    const summary = summarize(
      account([], [balance('hyperliquid', '1000', '1000')]),
      [position('100', '10'), position('150', '-30')]
    )
    expect(summary.marginUsed).toBe('250')
    expect(summary.unrealizedPnl).toBe('-20')
    expect(summary.availableMargin).toBe('750')
  })

  it('returns string scalars, never numbers', () => {
    const summary = summarize(account([], []), [])
    expect(typeof summary.portfolioValue).toBe('string')
    expect(typeof summary.availableMargin).toBe('string')
    expect(typeof summary.marginUsed).toBe('string')
    expect(typeof summary.unrealizedPnl).toBe('string')
  })
})
