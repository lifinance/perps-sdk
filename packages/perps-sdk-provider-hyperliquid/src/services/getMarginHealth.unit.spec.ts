import { createPerpsClient } from '@lifi/perps-sdk'
import type { Market } from '@lifi/perps-types'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HL_CLEARINGHOUSE_STATE,
  HL_MARKETS,
  HL_SPOT_CLEARINGHOUSE_STATE,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { HlAbstractionMode, type HlClearinghouseState } from '../types/index.js'
import { getMarginHealth } from './getMarginHealth.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const client = createPerpsClient({
  integrator: 'test',
  apiKey: 'k',
  retry: false,
})
const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

const XYZ_MARKET: Market = {
  ...HL_MARKETS[0],
  id: 'xyz:XYZ',
  categoryId: 'xyz',
  baseAsset: {
    ...HL_MARKETS[0].baseAsset,
    id: 'xyz:XYZ',
    displaySymbol: 'XYZ',
  },
  quoteAsset: {
    providerId: 'hyperliquid',
    id: '200',
    displaySymbol: 'USDE',
    logoURI: '',
  },
}
const MARKETS = [...HL_MARKETS, XYZ_MARKET]

const crossState = (
  crossMaintenanceMarginUsed: string,
  accountValue: string
): HlClearinghouseState => ({
  ...HL_CLEARINGHOUSE_STATE,
  marginSummary: {
    ...HL_CLEARINGHOUSE_STATE.marginSummary,
    accountValue: '99999',
  },
  crossMarginSummary: {
    ...HL_CLEARINGHOUSE_STATE.crossMarginSummary,
    accountValue,
  },
  crossMaintenanceMarginUsed,
})

const isolatedPosition = (marginUsed: string) => ({
  position: {
    ...HL_CLEARINGHOUSE_STATE.assetPositions[0].position,
    coin: 'ETH',
    marginUsed,
    leverage: { type: 'isolated' as const, value: 5 },
  },
})

describe('getMarginHealth', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  describe('standard mode', () => {
    it.each([
      null,
      HlAbstractionMode.DEFAULT,
      HlAbstractionMode.DISABLED,
    ])('divides the main dex cross maintenance margin by its cross account value for %s', async (abstraction) => {
      const mock = installInfoFetchMock(
        {
          userAbstraction: abstraction,
          clearinghouseState: crossState('470', '1000'),
        },
        MARKETS
      )
      restore = mock.restore

      await expect(getMarginHealth(ctx, { address: ADDRESS })).resolves.toEqual(
        { ratio: '0.47', liquidationThreshold: '1' }
      )
      expect(
        mock.requests.filter((r) => r.body.type === 'clearinghouseState')
      ).toEqual([
        expect.objectContaining({
          body: { type: 'clearinghouseState', user: ADDRESS },
        }),
      ])
    })

    it('reads only the cross pool of the dex that categoryId selects', async () => {
      ;({ restore } = installInfoFetchMock(
        {
          userAbstraction: null,
          clearinghouseState: (body: { dex?: string }) =>
            body.dex === 'xyz'
              ? crossState('50', '200')
              : crossState('470', '1000'),
        },
        MARKETS
      ))

      await expect(
        getMarginHealth(ctx, { address: ADDRESS, categoryId: 'xyz' })
      ).resolves.toEqual({ ratio: '0.25', liquidationThreshold: '1' })
    })

    it('rejects a categoryId that is not a perps dex', async () => {
      ;({ restore } = installInfoFetchMock({ userAbstraction: null }, MARKETS))

      await expect(
        getMarginHealth(ctx, { address: ADDRESS, categoryId: 'spot' })
      ).rejects.toThrow(/no perps dex with categoryId 'spot'/)
    })

    it.each([
      ['a ratio equal to the threshold', crossState('1000', '1000'), '1'],
      ['a zero ratio without exposure', crossState('0.0', '1000'), '0'],
      ['a zero ratio for an empty account', crossState('0.0', '0.0'), '0'],
    ])('gives %s', async (_, state, ratio) => {
      ;({ restore } = installInfoFetchMock(
        { userAbstraction: null, clearinghouseState: state },
        MARKETS
      ))

      await expect(getMarginHealth(ctx, { address: ADDRESS })).resolves.toEqual(
        { ratio, liquidationThreshold: '1' }
      )
    })

    it.each([
      '0.0',
      '-250',
    ])('gives no health for exposure with account value %s', async (accountValue) => {
      ;({ restore } = installInfoFetchMock(
        {
          userAbstraction: null,
          clearinghouseState: crossState('470', accountValue),
        },
        MARKETS
      ))

      await expect(
        getMarginHealth(ctx, { address: ADDRESS })
      ).resolves.toBeUndefined()
    })
  })

  describe('unified account', () => {
    const unifiedResponses = (
      spotBalances: { token: number; total: string }[]
    ) => ({
      userAbstraction: HlAbstractionMode.UNIFIED_ACCOUNT,
      clearinghouseState: (body: { dex?: string }) =>
        body.dex === 'xyz'
          ? { ...crossState('50', '0'), assetPositions: [] }
          : {
              ...crossState('470', '0'),
              assetPositions: [
                HL_CLEARINGHOUSE_STATE.assetPositions[0],
                isolatedPosition('100'),
              ],
            },
      spotClearinghouseState: {
        ...HL_SPOT_CLEARINGHOUSE_STATE,
        balances: spotBalances.map(({ token, total }) => ({
          coin: String(token),
          token,
          total,
          hold: '0',
          entryNtl: '0',
        })),
      },
    })

    it('gives the largest token ratio, net of the isolated margin of that token', async () => {
      ;({ restore } = installInfoFetchMock(
        unifiedResponses([
          { token: 0, total: '1040' },
          { token: 200, total: '200' },
        ]),
        MARKETS
      ))

      // USDC: 470 ÷ (1040 − 100) = 0.5. USDE: 50 ÷ 200 = 0.25.
      await expect(
        getMarginHealth(ctx, { address: ADDRESS, categoryId: 'xyz' })
      ).resolves.toEqual({ ratio: '0.5', liquidationThreshold: '1' })
    })

    it('gives no health when a token with exposure has no positive collateral', async () => {
      ;({ restore } = installInfoFetchMock(
        unifiedResponses([{ token: 0, total: '1040' }]),
        MARKETS
      ))

      await expect(
        getMarginHealth(ctx, { address: ADDRESS })
      ).resolves.toBeUndefined()
    })
  })

  it.each([
    HlAbstractionMode.PORTFOLIO_MARGIN,
    HlAbstractionMode.DEX_ABSTRACTION,
    'futureMode',
  ])('gives no health for the %s mode', async (abstraction) => {
    ;({ restore } = installInfoFetchMock(
      { userAbstraction: abstraction },
      MARKETS
    ))

    await expect(
      getMarginHealth(ctx, { address: ADDRESS })
    ).resolves.toBeUndefined()
  })
})
