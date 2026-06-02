import type {
  AccountResponse,
  Asset,
  Balance,
  Position,
} from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { summarizeLighterAccount } from './accountSummary.js'

const usdc: Asset = {
  providerId: 'lighter',
  id: 'USDC',
  displaySymbol: 'USDC',
  logoURI: '',
}

const balance = (
  categoryId: string,
  units: string,
  valueUsd: string
): Balance => ({ categoryId, asset: usdc, units, valueUsd })

const market = {
  providerId: 'lighter',
  id: '0',
  categoryId: 'lighter',
  baseAsset: { ...usdc, id: '0', displaySymbol: 'BTC' },
  quoteAsset: usdc,
}

const position = (marginUsed: string, unrealizedPnl: string): Position => ({
  market,
  side: PositionSide.LONG,
  size: '1',
  entryPrice: '50000',
  markPrice: '51000',
  liquidationPrice: '40000',
  unrealizedPnl,
  leverage: 5,
  marginUsed,
  marginMode: MarginMode.CROSS,
})

const account = (
  balances: Balance[],
  collateralBalances: Balance[]
): AccountResponse => ({
  provider: 'lighter',
  address: '0x1234567890123456789012345678901234567890',
  balances,
  collateralBalances,
  marginUsed: '0',
  unrealizedPnl: '0',
  feeTier: { maker: '0', taker: '0' },
  config: {
    provider: 'lighter',
    accountIndex: 42,
    apiKeyIndex: 1,
    apiKeyRegistered: true,
    accountType: 0,
  },
})

describe('summarizeLighterAccount', () => {
  it('rolls up collateral, balances and position pnl into the account summary', () => {
    const summary = summarizeLighterAccount(
      account(
        [balance('spot', '100', '100')],
        [balance('lighter', '2000', '2000')]
      ),
      [position('500', '75')]
    )

    expect(summary.marginUsed).toBe('500')
    expect(summary.unrealizedPnl).toBe('75')
    // collateral 2000 - marginUsed 500
    expect(summary.availableMargin).toBe('1500')
    // balances 100 + collateral 2000 + pnl 75
    expect(summary.portfolioValue).toBe('2175')
  })

  it('aggregates margin used and pnl across multiple positions', () => {
    const summary = summarizeLighterAccount(
      account([], [balance('lighter', '1000', '1000')]),
      [position('100', '10'), position('200', '-40')]
    )

    expect(summary.marginUsed).toBe('300')
    expect(summary.unrealizedPnl).toBe('-30')
    expect(summary.availableMargin).toBe('700')
  })

  it('returns zeroed string scalars for an empty account', () => {
    const summary = summarizeLighterAccount(account([], []), [])

    expect(summary).toEqual({
      portfolioValue: '0',
      availableMargin: '0',
      marginUsed: '0',
      unrealizedPnl: '0',
    })
  })
})
