import { createPerpsClient } from '@lifi/perps-sdk'
import { ActivityType } from '@lifi/perps-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HL_DELISTED_MARKET,
  HL_DELISTED_USER_FUNDING,
  HL_MARKETS,
  HL_USER_FUNDING,
  HL_USER_NON_FUNDING_LEDGER,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import type {
  HlUserFunding,
  HlUserNonFundingLedgerUpdates,
} from '../types/index.js'
import { getActivity } from './getActivity.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const client = createPerpsClient({
  integrator: 'test',
  apiKey: 'k',
  retry: false,
})

const baseResponses = {
  userNonFundingLedgerUpdates: HL_USER_NON_FUNDING_LEDGER,
  userFunding: HL_USER_FUNDING,
}

const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

describe('getActivity', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('merges ledger and funding entries newest-first and enriches funding assets', async () => {
    ;({ restore } = installInfoFetchMock(baseResponses, HL_MARKETS))

    const result = await getActivity(ctx, {
      address: ADDRESS,
    })

    expect(result.provider).toBe('hyperliquid')
    expect(result.items).toHaveLength(2)
    const types = result.items.map((i) => i.type).sort()
    expect(types).toEqual([ActivityType.DEPOSIT, ActivityType.FUNDING].sort())
    const funding = result.items.find((i) => i.type === ActivityType.FUNDING)!
    if (funding.type === ActivityType.FUNDING) {
      expect(funding.market.categoryId).toBe('hyperliquid')
      expect(funding.market.quoteAsset.displaySymbol).toBe('USDC')
    }
  })

  it('maps funding activity for a known delisted market', async () => {
    ;({ restore } = installInfoFetchMock(
      {
        ...baseResponses,
        userFunding: HL_DELISTED_USER_FUNDING,
      },
      [...HL_MARKETS, HL_DELISTED_MARKET]
    ))

    const result = await getActivity(ctx, {
      address: ADDRESS,
      type: [ActivityType.FUNDING],
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0].type).toBe(ActivityType.FUNDING)
    if (result.items[0].type === ActivityType.FUNDING) {
      expect(result.items[0].market.id).toBe('DELISTED')
      expect(result.items[0].market.isDelisted).toBe(true)
    }
  })

  it('skips the userFunding call when type=[DEPOSIT]', async () => {
    const mock = installInfoFetchMock(baseResponses, HL_MARKETS)
    restore = mock.restore

    await getActivity(ctx, {
      address: ADDRESS,
      type: [ActivityType.DEPOSIT],
    })

    expect(mock.requests.some((r) => r.body.type === 'userFunding')).toBe(false)
  })

  it('skips the ledger call when type=[FUNDING]', async () => {
    const mock = installInfoFetchMock(baseResponses, HL_MARKETS)
    restore = mock.restore

    await getActivity(ctx, {
      address: ADDRESS,
      type: [ActivityType.FUNDING],
    })

    expect(
      mock.requests.some((r) => r.body.type === 'userNonFundingLedgerUpdates')
    ).toBe(false)
  })

  it('skips the market list when no requested type names a market', async () => {
    const mock = installInfoFetchMock(baseResponses, HL_MARKETS)
    restore = mock.restore

    await getActivity(ctx, {
      address: ADDRESS,
      type: [ActivityType.DEPOSIT, ActivityType.WITHDRAWAL],
    })

    expect(mock.referenceRequests).toEqual([])
  })

  it('fetches the market list for a liquidation-only request', async () => {
    const mock = installInfoFetchMock(baseResponses, HL_MARKETS)
    restore = mock.restore

    await getActivity(ctx, {
      address: ADDRESS,
      type: [ActivityType.LIQUIDATION],
    })

    expect(mock.referenceRequests.some((url) => url.includes('/markets'))).toBe(
      true
    )
  })

  it('uses cursor to upper-bound results and emits a next cursor from the tail timestamp', async () => {
    ;({ restore } = installInfoFetchMock(baseResponses, HL_MARKETS))

    const cursor = '1900000000000' // far future, includes both items
    const result = await getActivity(ctx, {
      address: ADDRESS,
      cursor,
    })

    expect(result.items).toHaveLength(2)
    expect(result.pagination.cursor).toBe(
      String(new Date(result.items[1].timestamp).getTime())
    )
  })
})

describe('getActivity — unresolvable market rows', () => {
  // The market registry is cached per client and warns once per unresolved id,
  // so every test needs its own client to see its own warning.
  let ctx: { client: ReturnType<typeof createPerpsClient>; apiUrl: string }
  let restore: () => void

  beforeEach(() => {
    ctx = {
      client: createPerpsClient({
        integrator: 'test',
        apiKey: 'k',
        retry: false,
      }),
      apiUrl: DEFAULT_HYPERLIQUID_API_URL,
    }
  })

  afterEach(() => {
    restore?.()
  })

  const UNKNOWN_COIN = 'GHOST'

  const unknownFunding: HlUserFunding = [
    {
      time: 1704067100000,
      hash: '0xfund-unknown',
      delta: {
        type: 'funding',
        coin: UNKNOWN_COIN,
        usdc: '1.5',
        szi: '2',
        fundingRate: '0.0002',
      },
    },
    ...HL_USER_FUNDING,
  ]

  const liquidationEntry = (
    hash: string,
    coins: string[]
  ): HlUserNonFundingLedgerUpdates[number] => ({
    time: 1704067300000,
    hash,
    delta: {
      type: 'liquidation',
      liquidatedNtlPos: '1000',
      accountValue: '500',
      leverageType: 'cross',
      liquidatedPositions: coins.map((coin) => ({ coin, szi: '-1.5' })),
    },
  })

  it('drops a funding row whose market the registry cannot resolve', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;({ restore } = installInfoFetchMock(
      { ...baseResponses, userFunding: unknownFunding },
      HL_MARKETS
    ))

    const result = await getActivity(ctx, {
      address: ADDRESS,
      type: [ActivityType.FUNDING],
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      type: ActivityType.FUNDING,
      market: { id: 'BTC' },
    })
    expect(warn).toHaveBeenCalledWith(
      `[hyperliquid] unknown market id '${UNKNOWN_COIN}'`
    )
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('drops a liquidation row whose only market the registry cannot resolve', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;({ restore } = installInfoFetchMock(
      {
        ...baseResponses,
        userNonFundingLedgerUpdates: [
          liquidationEntry('0xliq-unknown', [UNKNOWN_COIN]),
          ...HL_USER_NON_FUNDING_LEDGER,
        ],
      },
      HL_MARKETS
    ))

    const result = await getActivity(ctx, { address: ADDRESS })

    expect(result.items.map((i) => i.id)).toEqual([
      '0xdep1',
      'funding:BTC:2024-01-01T00:00:00.000Z',
    ])
    expect(warn).toHaveBeenCalledWith(
      `[hyperliquid] unknown market id '${UNKNOWN_COIN}'`
    )
    warn.mockRestore()
  })

  it('keeps the resolvable legs of a multi-market liquidation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;({ restore } = installInfoFetchMock(
      {
        ...baseResponses,
        userNonFundingLedgerUpdates: [
          liquidationEntry('0xliq-mixed', [UNKNOWN_COIN, 'ETH']),
        ],
      },
      HL_MARKETS
    ))

    const result = await getActivity(ctx, {
      address: ADDRESS,
      type: [ActivityType.LIQUIDATION],
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id: '0xliq-mixed',
      type: ActivityType.LIQUIDATION,
      liquidatedPositions: [{ market: { id: 'ETH' }, size: '-1.5' }],
    })
    warn.mockRestore()
  })

  it('keeps a liquidation row on a delisted market', async () => {
    ;({ restore } = installInfoFetchMock(
      {
        ...baseResponses,
        userNonFundingLedgerUpdates: [
          liquidationEntry('0xliq-delisted', ['DELISTED']),
        ],
      },
      [...HL_MARKETS, HL_DELISTED_MARKET]
    ))

    const result = await getActivity(ctx, {
      address: ADDRESS,
      type: [ActivityType.LIQUIDATION],
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      type: ActivityType.LIQUIDATION,
      liquidatedPositions: [{ market: { id: 'DELISTED', isDelisted: true } }],
    })
  })

  it('propagates a failed funding fetch instead of returning an empty page', async () => {
    ;({ restore } = installInfoFetchMock(
      { userNonFundingLedgerUpdates: HL_USER_NON_FUNDING_LEDGER },
      HL_MARKETS
    ))

    await expect(
      getActivity(ctx, { address: ADDRESS, type: [ActivityType.FUNDING] })
    ).rejects.toThrow()
  })
})
