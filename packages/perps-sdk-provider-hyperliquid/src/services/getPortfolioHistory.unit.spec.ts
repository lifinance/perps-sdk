import { createPerpsClient } from '@lifi/perps-sdk'
import { PerpsErrorCode, type PortfolioHistoryRange } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installInfoFetchMock as installFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import {
  HlAbstractionMode,
  type HlPortfolio,
  type HlPortfolioPeriod,
} from '../types/index.js'
import { getPortfolioHistory } from './getPortfolioHistory.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const client = createPerpsClient({
  integrator: 'portfolio-test',
  apiKey: 'test-key',
  retry: false,
})
const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

const installInfoFetchMock = (responses: Record<string, unknown>) =>
  installFetchMock({ userNonFundingLedgerUpdates: [], ...responses })

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

const expectedPoints = (seed: number) => [
  {
    timestamp: 1_741_046_400_000,
    accountValue: `${1000 + seed}.5`,
    pnl: '0.0',
    netTransfers: '0',
  },
  {
    timestamp: 1_741_050_000_000,
    accountValue: `${1010 + seed}.25`,
    pnl: `${seed}.75`,
    netTransfers: '0',
  },
]

const requestBodies = (
  requests: { url: string; body: Record<string, unknown> }[]
) => requests.map((r) => r.body.type).sort()

describe('Hyperliquid getPortfolioHistory', () => {
  let restore: (() => void) | undefined

  afterEach(() => restore?.())

  it.each<[PortfolioHistoryRange, HlPortfolioPeriod, number]>([
    ['24h', 'perpDay', 5],
    ['7d', 'perpWeek', 6],
    ['30d', 'perpMonth', 7],
    ['all', 'perpAllTime', 8],
  ])('reads the %s range from the perps-only %s window when collateral lives per-dex', async (range, _period, seed) => {
    const installed = installInfoFetchMock({
      portfolio: PORTFOLIO,
      userAbstraction: null,
    })
    restore = installed.restore

    const result = await getPortfolioHistory(ctx, { address: ADDRESS, range })

    expect(requestBodies(installed.requests)).toEqual([
      'portfolio',
      'preTransferCheck',
      'userAbstraction',
      'userNonFundingLedgerUpdates',
    ])
    expect(result).toEqual({
      range,
      points: expectedPoints(seed),
      volume: `${seed * 100}.0`,
      totalPnl: `${seed}.75`,
    })
  })

  it.each<[PortfolioHistoryRange, HlPortfolioPeriod, number]>([
    ['24h', 'day', 1],
    ['7d', 'week', 2],
    ['30d', 'month', 3],
    ['all', 'allTime', 4],
  ])('reads the %s range from the combined %s window for a unified account', async (range, _period, seed) => {
    const installed = installInfoFetchMock({
      portfolio: PORTFOLIO,
      userAbstraction: HlAbstractionMode.UNIFIED_ACCOUNT,
    })
    restore = installed.restore

    await expect(
      getPortfolioHistory(ctx, { address: ADDRESS, range })
    ).resolves.toEqual({
      range,
      points: expectedPoints(seed),
      volume: `${seed * 100}.0`,
      totalPnl: `${seed}.75`,
    })
  })

  it('reads the combined window for a portfolio-margin account', async () => {
    const installed = installInfoFetchMock({
      portfolio: PORTFOLIO,
      userAbstraction: HlAbstractionMode.PORTFOLIO_MARGIN,
    })
    restore = installed.restore

    const result = await getPortfolioHistory(ctx, {
      address: ADDRESS,
      range: '24h',
    })

    expect(result.points).toEqual(expectedPoints(1))
  })

  it('carries the last sampled PnL when the PnL series is shorter', async () => {
    const installed = installInfoFetchMock({
      portfolio: [
        [
          'perpDay',
          {
            accountValueHistory: [
              [1_741_046_400_000, '1000.0'],
              [1_741_050_000_000, '1005.0'],
              [1_741_053_600_000, '1007.0'],
            ] as [number, string][],
            pnlHistory: [[1_741_050_000_000, '5.0']] as [number, string][],
            vlm: '10.0',
          },
        ],
      ],
      userAbstraction: null,
    })
    restore = installed.restore

    const result = await getPortfolioHistory(ctx, {
      address: ADDRESS,
      range: '24h',
    })

    expect(result.points).toEqual([
      {
        timestamp: 1_741_046_400_000,
        accountValue: '1000.0',
        pnl: '0',
        netTransfers: '0',
      },
      {
        timestamp: 1_741_050_000_000,
        accountValue: '1005.0',
        pnl: '5.0',
        netTransfers: '0',
      },
      {
        timestamp: 1_741_053_600_000,
        accountValue: '1007.0',
        pnl: '5.0',
        netTransfers: '0',
      },
    ])
    expect(result.totalPnl).toBe('5.0')
  })

  it('keeps sample values and volume as raw venue strings, and skips a sample with an invalid timestamp', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const installed = installInfoFetchMock({
      portfolio: [
        [
          'perpDay',
          {
            accountValueHistory: [
              [1_741_046_400_000, '1000.0'],
              [1_741_050_000_000, 'n/a'],
              [Number.NaN, '1001.0'],
            ] as [number, string][],
            pnlHistory: [
              [1_741_046_400_000, '2.0'],
              [1_741_050_000_000, ''],
              [Number.NaN, '3.0'],
            ] as [number, string][],
            vlm: 'NaN',
          },
        ],
      ],
      userAbstraction: null,
    })
    restore = installed.restore

    const result = await getPortfolioHistory(ctx, {
      address: ADDRESS,
      range: '24h',
    })

    expect(result).toEqual({
      range: '24h',
      points: [
        {
          timestamp: 1_741_046_400_000,
          accountValue: '1000.0',
          pnl: '2.0',
          netTransfers: '0',
        },
        {
          timestamp: 1_741_050_000_000,
          accountValue: 'n/a',
          pnl: '',
          netTransfers: '0',
        },
      ],
      volume: 'NaN',
      totalPnl: '',
    })
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('throws a ThirdPartyError when the two series share no timestamp', async () => {
    const installed = installInfoFetchMock({
      portfolio: [
        [
          'perpDay',
          {
            accountValueHistory: [[1_741_046_400_000, '1000.0']] as [
              number,
              string,
            ][],
            pnlHistory: [[1_741_046_400_001, '5.0']] as [number, string][],
            vlm: '10.0',
          },
        ],
      ],
      userAbstraction: null,
    })
    restore = installed.restore

    await expect(
      getPortfolioHistory(ctx, { address: ADDRESS, range: '24h' })
    ).rejects.toMatchObject({ code: PerpsErrorCode.ThirdPartyError })
  })

  it('returns no points and no totalPnl for an account with no history', async () => {
    const installed = installInfoFetchMock({
      portfolio: [
        ['perpDay', { accountValueHistory: [], pnlHistory: [], vlm: '0.0' }],
      ],
      userAbstraction: null,
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

  it('skips the ledger read for a single-sample window and anchors it at zero', async () => {
    const installed = installFetchMock({
      portfolio: [
        [
          'perpDay',
          {
            accountValueHistory: [[1_741_046_400_000, '1000.0']] as [
              number,
              string,
            ][],
            pnlHistory: [[1_741_046_400_000, '2.0']] as [number, string][],
            vlm: '10.0',
          },
        ],
      ],
      userAbstraction: null,
    })
    restore = installed.restore

    const result = await getPortfolioHistory(ctx, {
      address: ADDRESS,
      range: '24h',
    })

    expect(result.points).toEqual([
      {
        timestamp: 1_741_046_400_000,
        accountValue: '1000.0',
        pnl: '2.0',
        netTransfers: '0',
      },
    ])
    expect(requestBodies(installed.requests)).toEqual([
      'portfolio',
      'preTransferCheck',
      'userAbstraction',
    ])
  })

  it('throws a ThirdPartyError when the requested window is missing', async () => {
    const installed = installInfoFetchMock({
      portfolio: [['perpDay', window(1)]],
      userAbstraction: null,
    })
    restore = installed.restore

    await expect(
      getPortfolioHistory(ctx, { address: ADDRESS, range: '7d' })
    ).rejects.toMatchObject({ code: PerpsErrorCode.ThirdPartyError })
  })
  it.each([
    [null, '10.2'],
    [HlAbstractionMode.UNIFIED_ACCOUNT, '0.2'],
    [HlAbstractionMode.PORTFOLIO_MARGIN, '0.2'],
  ])('aggregates raw ledger rows for abstraction %s', async (abstraction, expected) => {
    const installed = installInfoFetchMock({
      portfolio: PORTFOLIO,
      userAbstraction: abstraction,
      userNonFundingLedgerUpdates: [
        {
          time: 1_741_046_400_000,
          hash: 'baseline',
          delta: { type: 'deposit', usdc: '100' },
        },
        {
          time: 1_741_048_000_000,
          hash: 'transfer',
          delta: { type: 'accountClassTransfer', usdc: '10', toPerp: true },
        },
        {
          time: 1_741_050_000_000,
          hash: 'deposit',
          delta: { type: 'deposit', usdc: '0.2' },
        },
        {
          time: 1_741_050_000_001,
          hash: 'outside',
          delta: { type: 'withdraw', usdc: '100' },
        },
      ],
    })
    restore = installed.restore
    const result = await getPortfolioHistory(ctx, {
      address: ADDRESS,
      range: '24h',
    })
    expect(result.points.map((p) => p.netTransfers)).toEqual(['0', expected])
    expect(
      installed.requests.find(
        (r) => r.body.type === 'userNonFundingLedgerUpdates'
      )?.body
    ).toEqual({
      type: 'userNonFundingLedgerUpdates',
      user: ADDRESS,
      startTime: 1_741_046_400_000,
      endTime: 1_741_050_000_000,
    })
  })

  it('preserves account values and PnL after missing transfer valuation', async () => {
    const installed = installInfoFetchMock({
      portfolio: PORTFOLIO,
      userAbstraction: HlAbstractionMode.UNIFIED_ACCOUNT,
      userNonFundingLedgerUpdates: [
        {
          time: 1_741_048_000_000,
          hash: 'unknown',
          delta: {
            type: 'spotTransfer',
            user: ADDRESS,
            destination: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            token: 'HYPE',
            amount: '2',
          },
        },
      ],
    })
    restore = installed.restore
    const result = await getPortfolioHistory(ctx, {
      address: ADDRESS,
      range: '24h',
    })
    expect(result.points).toEqual([
      expectedPoints(1)[0],
      { timestamp: 1_741_050_000_000, accountValue: '1011.25', pnl: '1.75' },
    ])
  })

  it('propagates ledger source failures', async () => {
    const installed = installInfoFetchMock({
      portfolio: PORTFOLIO,
      userAbstraction: null,
      userNonFundingLedgerUpdates: new Response('failed', { status: 400 }),
    })
    restore = installed.restore
    await expect(
      getPortfolioHistory(ctx, { address: ADDRESS, range: '24h' })
    ).rejects.toMatchObject({
      code: PerpsErrorCode.ThirdPartyError,
    })
  })
})
