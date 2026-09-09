import { createPerpsClient } from '@lifi/perps-sdk'
import { PerpsErrorCode, type PortfolioHistoryRange } from '@lifi/perps-types'
import { afterEach, describe, expect, it } from 'vitest'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import type { HlPortfolio, HlPortfolioPeriod } from '../types/index.js'
import { getPortfolioHistory } from './getPortfolioHistory.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const client = createPerpsClient({
  integrator: 'portfolio-test',
  apiKey: 'test-key',
  retry: false,
})
const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

const window = (seed: number) => ({
  accountValueHistory: [
    [1_741_046_400_000, `${1000 + seed}.5`],
    [1_741_050_000_000, `${1010 + seed}.25`],
  ] as [number, string][],
  pnlHistory: [
    [1_741_046_400_000, '0.0'],
    [1_741_050_000_000, `${seed}.75`],
  ] as [number, string][],
  vlm: `${seed * 100}.0`,
})

const PORTFOLIO: HlPortfolio = [
  ['day', window(1)],
  ['week', window(2)],
  ['month', window(3)],
  ['allTime', window(4)],
  ['perpDay', window(5)],
  ['perpWeek', window(6)],
  ['perpMonth', window(7)],
  ['perpAllTime', window(8)],
]

describe('Hyperliquid getPortfolioHistory', () => {
  let restore: (() => void) | undefined

  afterEach(() => restore?.())

  it.each<[PortfolioHistoryRange, HlPortfolioPeriod, number]>([
    ['24h', 'day', 1],
    ['7d', 'week', 2],
    ['30d', 'month', 3],
    ['all', 'allTime', 4],
  ])('maps range %s to the combined %s window from one portfolio request', async (range, _period, seed) => {
    const installed = installInfoFetchMock({ portfolio: PORTFOLIO })
    restore = installed.restore

    const result = await getPortfolioHistory(ctx, { address: ADDRESS, range })

    expect(installed.requests).toEqual([
      {
        url: `${DEFAULT_HYPERLIQUID_API_URL}/info`,
        body: { type: 'portfolio', user: ADDRESS },
      },
    ])
    expect(result).toEqual({
      range,
      points: [
        {
          timestamp: 1_741_046_400_000,
          accountValue: `${1000 + seed}.5`,
          pnl: '0.0',
        },
        {
          timestamp: 1_741_050_000_000,
          accountValue: `${1010 + seed}.25`,
          pnl: `${seed}.75`,
        },
      ],
      volume: `${seed * 100}.0`,
      totalPnl: `${seed}.75`,
    })
  })

  it('returns no points and no totalPnl for an account with no history', async () => {
    const installed = installInfoFetchMock({
      portfolio: [
        ['day', { accountValueHistory: [], pnlHistory: [], vlm: '0.0' }],
      ],
    })
    restore = installed.restore

    await expect(
      getPortfolioHistory(ctx, { address: ADDRESS, range: '24h' })
    ).resolves.toEqual({
      range: '24h',
      points: [],
      volume: '0.0',
      totalPnl: undefined,
    })
  })

  it('throws a ThirdPartyError when the requested window is missing', async () => {
    const installed = installInfoFetchMock({
      portfolio: [['day', window(1)]],
    })
    restore = installed.restore

    await expect(
      getPortfolioHistory(ctx, { address: ADDRESS, range: '7d' })
    ).rejects.toMatchObject({ code: PerpsErrorCode.ThirdPartyError })
  })
})
