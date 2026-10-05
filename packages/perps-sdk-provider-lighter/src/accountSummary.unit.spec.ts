import { PerpsError } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  Asset,
  Balance,
  LighterAccountConfig,
  LighterProviderKey,
  Position,
} from '@lifi/perps-types'
import {
  MarginMode,
  PositionMarginAdjustment,
  PositionSide,
} from '@lifi/perps-types'
import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import { getAccountSummary, lighterPortfolioValue } from './accountSummary.js'

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
  crossAssetValue: string,
  totalAssetValue: string,
  balances: Balance[] = [],
  provider: LighterProviderKey = 'lighter',
  configOverrides: Partial<LighterAccountConfig> = {}
): AccountResponse => ({
  provider,
  address: '0x0000000000000000000000000000000000000001',
  balances,
  collateralBalances: [balance(totalAssetValue)],
  positions: [],
  marginUsed: '0',
  unrealizedPnl: '0',
  feeTier: { maker: '0', taker: '0' },
  config: {
    provider,
    accountIndex: 0,
    apiKeyIndex: 0,
    apiKeyRegistered: true,
    accountType: 0,
    availableBalance: crossAssetValue,
    crossAssetValue,
    crossInitialMarginRequirement: '0',
    totalAssetValue,
    collateralSpotBalance: '0',
    accountTradingMode: 0,
    assetCollateral: [],
    readOnlyTokenApproved: true,
    referralPresent: false,
    ...configOverrides,
  },
})

describe('getAccountSummary', () => {
  it('reads availableMargin from the cross figures and portfolioValue from total_asset_value', () => {
    const summary = getAccountSummary(account('800', '1000'), [
      position('200', '50'),
    ])
    expect(summary.availableMargin).toBe('800')
    expect(summary.portfolioValue).toBe('1000')
    expect(summary.marginUsed).toBe('200')
    expect(summary.unrealizedPnl).toBe('50')
  })

  it('reads availableMargin as cross_asset_value minus the cross IMR, not available_balance', () => {
    const summary = getAccountSummary(
      account('1000', '1300', [], 'lighter', {
        availableBalance: '900',
        crossInitialMarginRequirement: '200',
      }),
      []
    )
    expect(summary.availableMargin).toBe('800')
  })

  it('floors availableMargin at 0 when the cross IMR exceeds cross_asset_value', () => {
    const summary = getAccountSummary(
      account('100', '100', [], 'lighter', {
        crossInitialMarginRequirement: '150.5',
      }),
      []
    )
    expect(summary.availableMargin).toBe('0')
  })

  it('rejects a non-decimal cross IMR', () => {
    const broken = account('100', '100', [], 'lighter', {
      crossInitialMarginRequirement: 'n/a',
    })
    expect(() => getAccountSummary(broken, [])).toThrow(PerpsError)
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

  it('adds every non-settlement spot row value and the settlement spot balance to total_asset_value', () => {
    const summary = getAccountSummary(
      account(
        '800',
        '1000',
        [
          balance('250'),
          { ...balance('814.23'), asset: { ...USDC, id: '1' } },
          { ...balance('0'), asset: { ...USDC, id: '0' } },
        ],
        'lighter',
        { collateralSpotBalance: '250' }
      ),
      [position('200', '0')]
    )
    expect(summary.portfolioValue).toBe('2064.23')
  })

  it('counts the settlement token once per route and never adds a settlement row', () => {
    // total_asset_value carries the perps-route USDC and collateralSpotBalance
    // the spot-route USDC, so the settlement rows add nothing.
    const summary = getAccountSummary(
      account('800', '1000', [balance('103.00085138124')], 'lighter', {
        collateralSpotBalance: '103.00085138124',
      }),
      []
    )
    expect(summary.portfolioValue).toBe('1103.00085138124')
    expect(summary.availableMargin).toBe('800')
  })

  it('counts a unified pooled settlement row once', () => {
    const pooled: Balance = {
      categoryId: 'spot',
      asset: { ...USDC, id: '3' },
      units: '1003',
      valueUsd: '1003',
      transferable: '803',
    }
    const summary = getAccountSummary(
      {
        ...account('800', '1000', [pooled], 'lighter', {
          accountTradingMode: 1,
          collateralSpotBalance: '3',
        }),
        collateralBalances: [],
      },
      []
    )
    expect(summary.portfolioValue).toBe('1003')
  })

  it('writes a dust total in plain decimal notation', () => {
    const summary = getAccountSummary(
      account('0.00000001', '0', [balance('0.00000001')], 'lighter', {
        collateralSpotBalance: '0.00000001',
      }),
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
    const broken = account('800', '1000', [
      { ...balance('n/a'), asset: { ...USDC, id: '1' } },
    ])
    expect(() => getAccountSummary(broken, [])).toThrow(PerpsError)
  })

  it('rejects a non-decimal settlement spot balance', () => {
    const broken = account('800', '1000', [], 'lighter', {
      collateralSpotBalance: 'n/a',
    })
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

  it('accepts the Robinhood-chain deployment config', () => {
    const rh = account('800', '1000', [], 'lighter-rh')
    expect(getAccountSummary(rh, []).availableMargin).toBe('800')
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

describe('lighterPortfolioValue', () => {
  it('adds every spot value to the perps equity', () => {
    expect(
      lighterPortfolioValue(new Big('12.5'), ['50.25', '0', '0.1']).toFixed()
    ).toBe('62.85')
  })

  it('returns the perps equity without spot values', () => {
    expect(lighterPortfolioValue(new Big('7'), []).toFixed()).toBe('7')
  })

  it('rejects a non-decimal spot value', () => {
    expect(() => lighterPortfolioValue(new Big('7'), ['n/a'])).toThrow(
      PerpsError
    )
  })
})
