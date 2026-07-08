import type {
  AccountResponse,
  Asset,
  Balance,
  Position,
} from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { getAccountSummary } from './accountSummary.js'

const USDC: Asset = {
  providerId: 'lighter',
  id: 'USDC',
  displaySymbol: 'USDC',
  logoURI: 'https://x/usdc.png',
}

const balance = (valueUsd: string): Balance => ({
  categoryId: 'lighter',
  asset: USDC,
  units: valueUsd,
  valueUsd,
})

const position = (marginUsed: string, unrealizedPnl: string): Position => ({
  market: {
    providerId: 'lighter',
    id: '1',
    categoryId: 'lighter',
    baseAsset: { ...USDC, id: 'ETH', displaySymbol: 'ETH' },
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
  provider: 'lighter',
  address: '0x0000000000000000000000000000000000000001',
  balances,
  collateralBalances,
  positions: [],
  marginUsed: '0',
  unrealizedPnl: '0',
  feeTier: { maker: '0', taker: '0' },
  config: {
    provider: 'lighter',
    accountIndex: 0,
    apiKeyIndex: 0,
    apiKeyRegistered: true,
    accountType: 0,
    readOnlyTokenApproved: true,
  },
})

describe('getAccountSummary', () => {
  it('adds locked margin back but never re-adds the PnL already in available_balance', () => {
    // available_balance 800 nets margin out and marks the +50 pnl in
    const summary = getAccountSummary(account([balance('800')]), [
      position('200', '50'),
    ])
    expect(summary.availableMargin).toBe('800')
    expect(summary.marginUsed).toBe('200')
    expect(summary.unrealizedPnl).toBe('50')
    // portfolio = available 800 (pnl included) + locked margin 200
    expect(summary.portfolioValue).toBe('1000')
  })

  it('adds non-collateral balances to portfolio value only', () => {
    const summary = getAccountSummary(
      account([balance('800')], [balance('250')]),
      [position('200', '0')]
    )
    expect(summary.availableMargin).toBe('800')
    // portfolio = balances 250 + collateral 800 + margin 200 + pnl 0
    expect(summary.portfolioValue).toBe('1250')
  })

  it('aggregates margin used and pnl across multiple positions', () => {
    const summary = getAccountSummary(account([balance('1000')]), [
      position('100', '10'),
      position('150', '-30'),
    ])
    expect(summary.marginUsed).toBe('250')
    expect(summary.unrealizedPnl).toBe('-20')
    expect(summary.availableMargin).toBe('1000')
  })

  it('returns string scalars for an empty account', () => {
    const summary = getAccountSummary(account([]), [])
    expect(summary).toEqual({
      portfolioValue: '0',
      availableMargin: '0',
      marginUsed: '0',
      unrealizedPnl: '0',
    })
  })
})
