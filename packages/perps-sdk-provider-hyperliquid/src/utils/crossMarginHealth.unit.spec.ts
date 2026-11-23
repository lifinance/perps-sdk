import {
  AccountMode,
  type Asset,
  CrossMarginHealthStatus,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { HL_CLEARINGHOUSE_STATE, USDC_ASSET } from '../../test/fixtures.js'
import {
  HlAbstractionMode,
  type HlAssetPosition,
  type HlClearinghouseState,
  type HlSpotClearinghouseState,
} from '../types/account.js'
import { buildHyperliquidCrossMarginHealth } from './crossMarginHealth.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

const USDE_ASSET: Asset = {
  providerId: 'hyperliquid',
  id: '200',
  displaySymbol: 'USDE',
  logoURI: '',
}

const QUOTE_ASSET_BY_CATEGORY = new Map<string, Asset>([
  ['hyperliquid', USDC_ASSET],
  ['flx', USDC_ASSET],
  ['xyz', USDE_ASSET],
])

const assetPosition = (
  coin: string,
  type: 'cross' | 'isolated',
  marginUsed: string
): HlAssetPosition => ({
  position: {
    ...HL_CLEARINGHOUSE_STATE.assetPositions[0].position,
    coin,
    marginUsed,
    leverage: { type, value: 10 },
  },
})

const dexState = (
  crossMaintenanceMarginUsed: string,
  assetPositions: HlAssetPosition[] = [],
  crossAccountValue = '1000'
): HlClearinghouseState => ({
  ...HL_CLEARINGHOUSE_STATE,
  // The whole-account summary differs from the cross one, so a test fails
  // when the provider reads isolated equity.
  marginSummary: {
    ...HL_CLEARINGHOUSE_STATE.marginSummary,
    accountValue: '99999',
  },
  crossMarginSummary: {
    ...HL_CLEARINGHOUSE_STATE.crossMarginSummary,
    accountValue: crossAccountValue,
  },
  crossMaintenanceMarginUsed,
  assetPositions,
})

const spotState = (
  balances: [token: number, total: string][]
): HlSpotClearinghouseState => ({
  balances: balances.map(([token, total]) => ({
    coin: String(token),
    token,
    total,
    hold: '0',
    entryNtl: '0',
  })),
  tokenToAvailableAfterMaintenance: [],
})

const healthFor = (
  abstraction: HlAbstractionMode | null,
  stateByDex: Map<string, HlClearinghouseState>,
  spot: HlSpotClearinghouseState = spotState([[0, '100']])
) =>
  buildHyperliquidCrossMarginHealth(
    ADDRESS,
    abstraction,
    stateByDex,
    spot,
    QUOTE_ASSET_BY_CATEGORY
  )

const UNIFIED = HlAbstractionMode.UNIFIED_ACCOUNT

describe('buildHyperliquidCrossMarginHealth', () => {
  describe('standard accounts', () => {
    it.each([
      null,
      HlAbstractionMode.DEFAULT,
      HlAbstractionMode.DISABLED,
    ])('divides each dex cross maintenance margin by its cross account value for %s', (abstraction) => {
      expect(
        healthFor(
          abstraction,
          new Map([
            ['', dexState('100', [], '1000')],
            ['xyz', dexState('5', [], '20')],
          ])
        )
      ).toEqual([
        {
          mode: AccountMode.STANDARD,
          pool: { type: 'dex', categoryId: 'hyperliquid' },
          liquidationThreshold: '1',
          status: CrossMarginHealthStatus.MEASURED,
          ratio: '0.1',
        },
        {
          mode: AccountMode.STANDARD,
          pool: { type: 'dex', categoryId: 'xyz' },
          liquidationThreshold: '1',
          status: CrossMarginHealthStatus.MEASURED,
          ratio: '0.25',
        },
      ])
    })

    it('keeps each dex separate: one dex at the boundary, one without exposure', () => {
      expect(
        healthFor(
          null,
          new Map([
            ['', dexState('250.5', [], '250.5')],
            ['xyz', dexState('0.0', [], '20')],
          ])
        )
      ).toMatchObject([
        { status: CrossMarginHealthStatus.MEASURED, ratio: '1' },
        { status: CrossMarginHealthStatus.NO_EXPOSURE },
      ])
    })

    it('reports non-positive equity for a dex with exposure and no cross equity', () => {
      expect(
        healthFor(null, new Map([['', dexState('10', [], '-3.5')]]))
      ).toMatchObject([{ status: CrossMarginHealthStatus.NON_POSITIVE_EQUITY }])
    })

    it('reports unavailable for a malformed venue figure', () => {
      expect(
        healthFor(null, new Map([['', dexState('10', [], '')]]))
      ).toMatchObject([{ status: CrossMarginHealthStatus.UNAVAILABLE }])
    })
  })

  describe('unified accounts', () => {
    it('groups dexes by collateral token and reports the largest token ratio with its token', () => {
      // Token 0: (30 + 20) ÷ (600 - 100 isolated) = 0.1. Token 200: 5 ÷ 20.
      const stateByDex = new Map([
        [
          '',
          dexState('30', [
            assetPosition('BTC', 'cross', '300'),
            assetPosition('ETH', 'isolated', '100'),
          ]),
        ],
        ['flx', dexState('20')],
        ['xyz', dexState('5')],
      ])

      expect(
        healthFor(
          UNIFIED,
          stateByDex,
          spotState([
            [0, '600'],
            [200, '20'],
          ])
        )
      ).toEqual([
        {
          mode: AccountMode.UNIFIED,
          pool: { type: 'collateralAsset', assetId: '200' },
          liquidationThreshold: '1',
          status: CrossMarginHealthStatus.MEASURED,
          ratio: '0.25',
        },
      ])
    })

    it('keeps the largest token ratio when a smaller one follows it', () => {
      // Token 200: 5 ÷ 20 = 0.25. Token 0: 10 ÷ 100 = 0.1.
      expect(
        healthFor(
          UNIFIED,
          new Map([
            ['xyz', dexState('5')],
            ['', dexState('10')],
          ]),
          spotState([
            [0, '100'],
            [200, '20'],
          ])
        )
      ).toMatchObject([
        {
          pool: { type: 'collateralAsset', assetId: '200' },
          status: CrossMarginHealthStatus.MEASURED,
          ratio: '0.25',
        },
      ])
    })

    it('gives a ratio equal to the threshold when available collateral equals maintenance margin', () => {
      expect(
        healthFor(
          UNIFIED,
          new Map([
            ['', dexState('50', [assetPosition('ETH', 'isolated', '50')])],
          ]),
          spotState([[0, '100']])
        )
      ).toMatchObject([
        { status: CrossMarginHealthStatus.MEASURED, ratio: '1' },
      ])
    })

    it('reports the token whose isolated margin consumes its collateral, over a measured token', () => {
      expect(
        healthFor(
          UNIFIED,
          new Map([
            ['', dexState('10')],
            ['xyz', dexState('5', [assetPosition('XYZ', 'isolated', '50')])],
          ]),
          spotState([
            [0, '100'],
            [200, '50'],
          ])
        )
      ).toEqual([
        {
          mode: AccountMode.UNIFIED,
          pool: { type: 'collateralAsset', assetId: '200' },
          liquidationThreshold: '1',
          status: CrossMarginHealthStatus.NON_POSITIVE_EQUITY,
        },
      ])
    })

    it('counts a missing spot row as a zero balance, not as no exposure', () => {
      expect(
        healthFor(
          UNIFIED,
          new Map([['xyz', dexState('5')]]),
          spotState([[0, '100']])
        )
      ).toMatchObject([
        {
          pool: { type: 'collateralAsset', assetId: '200' },
          status: CrossMarginHealthStatus.NON_POSITIVE_EQUITY,
        },
      ])
    })

    it('reports unavailable when one token lacks an input, over a measured token', () => {
      expect(
        healthFor(
          UNIFIED,
          new Map([
            ['', dexState('10')],
            ['xyz', dexState('5', [assetPosition('XYZ', 'isolated', 'n/a')])],
          ]),
          spotState([
            [0, '100'],
            [200, '50'],
          ])
        )
      ).toMatchObject([
        {
          pool: { type: 'collateralAsset', assetId: '200' },
          status: CrossMarginHealthStatus.UNAVAILABLE,
        },
      ])
    })

    it('reports account-wide no exposure when no token carries maintenance margin', () => {
      expect(healthFor(UNIFIED, new Map([['', dexState('0.0')]]))).toEqual([
        {
          mode: AccountMode.UNIFIED,
          pool: { type: 'account', accountId: ADDRESS },
          liquidationThreshold: '1',
          status: CrossMarginHealthStatus.NO_EXPOSURE,
        },
      ])
    })
  })

  it('reports portfolio margin as unavailable, with the venue threshold', () => {
    expect(
      healthFor(
        HlAbstractionMode.PORTFOLIO_MARGIN,
        new Map([['', dexState('10')]])
      )
    ).toEqual([
      {
        mode: AccountMode.PORTFOLIO_MARGIN,
        pool: { type: 'account', accountId: ADDRESS },
        liquidationThreshold: '0.95',
        status: CrossMarginHealthStatus.UNAVAILABLE,
      },
    ])
  })

  it('reports DEX abstraction as unavailable', () => {
    expect(
      healthFor(
        HlAbstractionMode.DEX_ABSTRACTION,
        new Map([['', dexState('10')]])
      )
    ).toEqual([
      {
        mode: AccountMode.DEX_ABSTRACTION,
        pool: { type: 'account', accountId: ADDRESS },
        liquidationThreshold: '1',
        status: CrossMarginHealthStatus.UNAVAILABLE,
      },
    ])
  })
})
