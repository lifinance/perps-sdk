import type {
  AccountResponse,
  Asset,
  Balance,
  Position,
} from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { summarizeHyperliquidAccount } from './accountSummary.js'

const usdc: Asset = {
  providerId: 'hyperliquid',
  id: 'USDC',
  displaySymbol: 'USDC',
  logoURI: 'https://app.hyperliquid.xyz/coins/USDC.svg',
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
  size: '0.1',
  entryPrice: '94000',
  markPrice: '95000',
  liquidationPrice: '85000',
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
  address: '0x1234567890123456789012345678901234567890',
  balances,
  collateralBalances,
  marginUsed: '0',
  unrealizedPnl: '0',
  feeTier: { maker: '0.0002', taker: '0.0005' },
  config: { provider: 'hyperliquid', abstractionMode: null, agents: [] },
})

describe('summarizeHyperliquidAccount', () => {
  it('rolls up collateral, balances and position pnl into the account summary', () => {
    const summary = summarizeHyperliquidAccount(
      account(
        [balance('spot', '5', '250')],
        [balance('hyperliquid', '1000', '1000')]
      ),
      [position('200', '50')]
    )

    expect(summary.marginUsed).toBe('200')
    expect(summary.unrealizedPnl).toBe('50')
    // collateral 1000 - marginUsed 200
    expect(summary.availableMargin).toBe('800')
    // balances 250 + collateral 1000 + pnl 50
    expect(summary.portfolioValue).toBe('1300')
  })

  it('aggregates margin used and pnl across multiple positions', () => {
    const summary = summarizeHyperliquidAccount(
      account([], [balance('hyperliquid', '1000', '1000')]),
      [position('100', '10'), position('150', '-30')]
    )

    expect(summary.marginUsed).toBe('250')
    expect(summary.unrealizedPnl).toBe('-20')
    expect(summary.availableMargin).toBe('750')
  })

  it('returns zeroed string scalars for an empty account', () => {
    const summary = summarizeHyperliquidAccount(account([], []), [])

    expect(summary).toEqual({
      portfolioValue: '0',
      availableMargin: '0',
      marginUsed: '0',
      unrealizedPnl: '0',
    })
  })
})
