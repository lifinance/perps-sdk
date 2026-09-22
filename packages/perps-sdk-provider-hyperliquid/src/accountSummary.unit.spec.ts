import { PerpsError } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  Asset,
  Balance,
  HyperliquidDexAccountState,
  OndoAccountConfig,
  Position,
} from '@lifi/perps-types'
import {
  MarginMode,
  PositionMarginAdjustment,
  PositionSide,
} from '@lifi/perps-types'
import Big from 'big.js'
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
  accruedFunding: '0',
  leverage: 10,
  marginUsed,
  initialMarginRequirement: marginUsed,
  marginMode: MarginMode.CROSS,
})

const dexState = (
  dex: string,
  accountValue: string,
  totalMarginUsed: string
): HyperliquidDexAccountState => {
  const marginSummary = {
    accountValue,
    totalNtlPos: '0.0',
    totalRawUsd: accountValue,
    totalMarginUsed,
  }
  return {
    dex,
    marginSummary,
    crossMarginSummary: marginSummary,
    crossMaintenanceMarginUsed: '0.0',
    withdrawable: '0.0',
  }
}

const MAIN_DEX = dexState('', '10000', '940')

const account = (
  abstractionMode: HlAbstractionMode | null,
  collateralBalances: Balance[],
  balances: Balance[] = [],
  dexStates: HyperliquidDexAccountState[] = [MAIN_DEX],
  availableAfterMaintenance?: string
): AccountResponse => ({
  provider: 'hyperliquid',
  address: '0x0000000000000000000000000000000000000001',
  balances,
  collateralBalances,
  positions: [],
  marginUsed: '0',
  unrealizedPnl: '0',
  feeTier: { maker: '0', taker: '0' },
  config: {
    provider: 'hyperliquid',
    abstractionMode,
    agents: [],
    dexStates,
    ...(availableAfterMaintenance === undefined
      ? {}
      : { availableAfterMaintenance }),
  },
})

// Every figure below reads back a venue field the response carries, so the
// spec cannot drift from what Hyperliquid reports.
const { accountValue, totalMarginUsed } = MAIN_DEX.marginSummary

describe('getAccountSummary', () => {
  describe.each([
    ['standard (null abstraction)', null],
    ['disabled', HlAbstractionMode.DISABLED],
    ['dexAbstraction', HlAbstractionMode.DEX_ABSTRACTION],
  ])('non-unified mode: %s', (_label, mode) => {
    it('reads margin used from the venue margin summary, not from the positions', () => {
      const summary = getAccountSummary(
        account(mode as HlAbstractionMode | null, [
          balance('hyperliquid', accountValue),
        ]),
        [position('100', '50')]
      )

      expect(summary.marginUsed).toBe(totalMarginUsed)
      expect(summary.unrealizedPnl).toBe('50')
    })

    it('reports account value minus margin used as available margin', () => {
      const summary = getAccountSummary(
        account(mode as HlAbstractionMode | null, [
          balance('hyperliquid', accountValue),
        ]),
        [position('100', '50')]
      )

      expect(summary.availableMargin).toBe(
        new Big(accountValue).minus(totalMarginUsed).toFixed()
      )
    })

    it('sums every balance row into portfolio value', () => {
      const summary = getAccountSummary(
        account(
          mode as HlAbstractionMode | null,
          [balance('spot', '500'), balance('hyperliquid', accountValue)],
          [balance('spot', '250')]
        ),
        [position('200', '0')]
      )

      expect(summary.portfolioValue).toBe(
        new Big(accountValue).plus('500').plus('250').toFixed()
      )
    })
  })

  describe.each([
    ['unifiedAccount', HlAbstractionMode.UNIFIED_ACCOUNT],
    ['portfolioMargin', HlAbstractionMode.PORTFOLIO_MARGIN],
  ])('unified mode: %s', (_label, mode) => {
    it('reports the venue buying power as available margin', () => {
      const summary = getAccountSummary(
        account(mode, [balance('spot', '10000')], [], [MAIN_DEX], '9060'),
        [position('940', '-100')]
      )

      expect(summary.availableMargin).toBe('9060')
      expect(summary.marginUsed).toBe(totalMarginUsed)
      expect(summary.unrealizedPnl).toBe('-100')
      expect(summary.portfolioValue).toBe('10000')
    })

    it('rejects an account that carries no venue buying power', () => {
      expect(() =>
        getAccountSummary(account(mode, [balance('spot', '10000')]), [])
      ).toThrowError(PerpsError)
    })
  })

  it('sums the margin summaries of every perps sub-dex', () => {
    const xyz = dexState('xyz', '0.2', '0.1')
    const summary = getAccountSummary(
      account(
        HlAbstractionMode.DEX_ABSTRACTION,
        [balance('hyperliquid', accountValue)],
        [],
        [MAIN_DEX, xyz]
      ),
      []
    )

    expect(summary.marginUsed).toBe(
      new Big(totalMarginUsed).plus(xyz.marginSummary.totalMarginUsed).toFixed()
    )
  })

  it('aggregates unrealized pnl across positions', () => {
    const summary = getAccountSummary(
      account(null, [balance('hyperliquid', accountValue)]),
      [position('100', '10'), position('150', '-30')]
    )

    expect(summary.unrealizedPnl).toBe('-20')
  })

  it('returns string scalars for an empty account', () => {
    const summary = getAccountSummary(account(null, [], [], []), [])

    expect(summary).toEqual({
      portfolioValue: '0',
      availableMargin: '0',
      marginUsed: '0',
      unrealizedPnl: '0',
    })
  })

  it('rejects an account config from another provider', () => {
    const ondo: OndoAccountConfig = {
      provider: 'ondo',
      loggedIn: false,
      termsAccepted: false,
      apiKeyRegistered: false,
      referralSet: false,
      depositAddress: null,
    }

    expect(() =>
      getAccountSummary({ ...account(null, []), config: ondo }, [])
    ).toThrowError(PerpsError)
  })
})
