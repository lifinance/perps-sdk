import type {
  AccountResponse,
  HyperliquidAccountConfig,
  Position,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { summarizeHyperliquidAccount } from './accountSummary.js'

const ADDRESS = '0x1111111111111111111111111111111111111111'

function config(abstractionMode: string | null): HyperliquidAccountConfig {
  return { provider: 'hyperliquid', abstractionMode, agents: [] }
}

function account(
  abstractionMode: string | null,
  balances: AccountResponse['balances']
): AccountResponse {
  return {
    provider: 'hyperliquid',
    address: ADDRESS,
    balances,
    marginUsed: '0',
    unrealizedPnl: '0',
    feeTier: { maker: '0', taker: '0' },
    config: config(abstractionMode),
  }
}

const NO_POSITIONS: Position[] = []

describe('summarizeHyperliquidAccount collateralGrouping', () => {
  it('reports perMarket for disabled mode (perps balances are free margin)', () => {
    const summary = summarizeHyperliquidAccount(
      account('disabled', {
        hyperliquid: [{ currency: 'USDC', amount: '100' }],
      }),
      NO_POSITIONS,
      {}
    )
    expect(summary.collateralGrouping).toBe('perMarket')
  })

  it('reports perMarket for dexAbstraction mode', () => {
    const summary = summarizeHyperliquidAccount(
      account('dexAbstraction', {
        hyperliquid: [{ currency: 'USDC', amount: '100' }],
      }),
      NO_POSITIONS,
      {}
    )
    expect(summary.collateralGrouping).toBe('perMarket')
  })

  it('reports perMarket when abstraction has never been set (null)', () => {
    const summary = summarizeHyperliquidAccount(
      account(null, { hyperliquid: [{ currency: 'USDC', amount: '100' }] }),
      NO_POSITIONS,
      {}
    )
    expect(summary.collateralGrouping).toBe('perMarket')
  })

  it('reports unified for unifiedAccount mode (spot is the margin asset)', () => {
    const summary = summarizeHyperliquidAccount(
      account('unifiedAccount', {
        spot: [{ currency: 'USDC', amount: '100' }],
      }),
      NO_POSITIONS,
      {}
    )
    expect(summary.collateralGrouping).toBe('unified')
  })

  it('reports unified for portfolioMargin mode', () => {
    const summary = summarizeHyperliquidAccount(
      account('portfolioMargin', {
        spot: [{ currency: 'USDC', amount: '100' }],
      }),
      NO_POSITIONS,
      {}
    )
    expect(summary.collateralGrouping).toBe('unified')
  })
})
