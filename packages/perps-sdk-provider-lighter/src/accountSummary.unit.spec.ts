import { PerpsError } from '@lifi/perps-sdk'
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

const position = (
  marginUsed: string,
  unrealizedPnl: string,
  marginMode = MarginMode.CROSS
): Position => ({
  market: {
    providerId: 'lighter',
    id: '1',
    categoryId: 'lighter',
    baseAsset: { ...USDC, id: 'ETH', displaySymbol: 'ETH' },
    quoteAsset: USDC,
    positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
  },
  side: PositionSide.LONG,
  size: '1',
  entryPrice: '100',
  markPrice: '110',
  liquidationPrice: '50',
  unrealizedPnl,
  accruedFunding: '0',
  leverage: 10,
  marginUsed,
  initialMarginRequirement: marginUsed,
  marginMode,
})

const account = (
  availableBalance: string,
  totalAssetValue: string,
  balances: Balance[] = []
): AccountResponse => ({
  provider: 'lighter',
  address: '0x0000000000000000000000000000000000000001',
  balances,
  collateralBalances: [balance(availableBalance)],
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
    availableBalance,
    totalAssetValue,
    accountTradingMode: 0,
    assetCollateral: [],
    readOnlyTokenApproved: true,
    referralPresent: false,
  },
})

describe('getAccountSummary', () => {
  it('reads availableMargin from available_balance and portfolioValue from total_asset_value', () => {
    const summary = getAccountSummary(account('800', '1000'), [
      position('200', '50'),
    ])
    expect(summary.availableMargin).toBe('800')
    expect(summary.portfolioValue).toBe('1000')
    expect(summary.marginUsed).toBe('200')
    expect(summary.unrealizedPnl).toBe('50')
  })

  it('carries an isolated allocation in total_asset_value without re-adding it', () => {
    // Captured from a real account: free cross collateral 1.506802, one
    // isolated BTC position with allocated_margin 10.179731 and uPnL
    // -0.006954; the venue's total_asset_value read 11.679579.
    const summary = getAccountSummary(account('1.506802', '11.679579'), [
      position('10.179731', '-0.006954', MarginMode.ISOLATED),
    ])
    expect(summary.availableMargin).toBe('1.506802')
    expect(summary.portfolioValue).toBe('11.679579')
  })

  it('adds every spot balance row value to total_asset_value', () => {
    const summary = getAccountSummary(
      account('800', '1000', [
        balance('250'),
        { ...balance('814.23'), asset: { ...USDC, id: '1' } },
        { ...balance('0'), asset: { ...USDC, id: '0' } },
      ]),
      [position('200', '0')]
    )
    expect(summary.portfolioValue).toBe('2064.23')
  })

  it('counts the settlement token once per route and never adds the collateral row', () => {
    // total_asset_value carries the perps-route USDC; the spot row carries the
    // spot-route USDC; the collateral row (800) is buying power inside
    // total_asset_value.
    const summary = getAccountSummary(
      account('800', '1000', [balance('103.00085138124')]),
      []
    )
    expect(summary.portfolioValue).toBe('1103.00085138124')
    expect(summary.availableMargin).toBe('800')
  })

  it('writes a dust total in plain decimal notation', () => {
    const summary = getAccountSummary(
      account('0.00000001', '0', [balance('0.00000001')]),
      [position('0.00000001', '-0.00000001')]
    )
    expect(summary).toEqual({
      portfolioValue: '0.00000001',
      availableMargin: '0.00000001',
      marginUsed: '0.00000001',
      unrealizedPnl: '-0.00000001',
    })
  })

  it('rejects a non-decimal spot balance value', () => {
    const broken = account('800', '1000', [balance('n/a')])
    expect(() => getAccountSummary(broken, [])).toThrow(PerpsError)
  })

  it('aggregates margin used and pnl across multiple positions', () => {
    const summary = getAccountSummary(account('1000', '1250'), [
      position('100', '10'),
      position('150', '-30'),
    ])
    expect(summary.marginUsed).toBe('250')
    expect(summary.unrealizedPnl).toBe('-20')
    expect(summary.availableMargin).toBe('1000')
  })

  it('returns string scalars for an empty account', () => {
    expect(getAccountSummary(account('0', '0'), [])).toEqual({
      portfolioValue: '0',
      availableMargin: '0',
      marginUsed: '0',
      unrealizedPnl: '0',
    })
  })

  it('rejects a non-Lighter account config', () => {
    const foreign = {
      ...account('800', '1000'),
      config: { provider: 'ondo' },
    } as unknown as AccountResponse
    expect(() => getAccountSummary(foreign, [])).toThrow(PerpsError)
  })

  it('rejects a non-decimal venue figure', () => {
    const broken = account('800', 'n/a')
    expect(() => getAccountSummary(broken, [])).toThrow(PerpsError)
  })
})
