import { createPerpsClient, PerpsError } from '@lifi/perps-sdk'
import { ActivityType, PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HL_MARKETS,
  HL_USER_FILLS,
  HL_USER_FUNDING,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import type {
  HlUserFills,
  HlUserFunding,
  HlUserNonFundingLedgerUpdates,
} from '../types/index.js'
import { getActivity } from './getActivity.js'
import { getFills } from './getFills.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const context = () => ({
  client: createPerpsClient({ integrator: 'test', apiKey: 'k', retry: false }),
  apiUrl: DEFAULT_HYPERLIQUID_API_URL,
})

function installHistory(
  fills: HlUserFills = [],
  funding: HlUserFunding = [],
  ledger: HlUserNonFundingLedgerUpdates = []
) {
  installInfoFetchMock({}, HL_MARKETS)
  const referenceFetch = vi.mocked(fetch).getMockImplementation()!
  const requests: Record<string, unknown>[] = []
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (init?.method !== 'POST') {
      return referenceFetch(input, init)
    }
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    requests.push(body)
    const rows =
      body.type === 'userFunding'
        ? funding
        : body.type === 'userNonFundingLedgerUpdates'
          ? ledger
          : fills.slice(-10000)
    const cap =
      body.type === 'userFunding' || body.type === 'userNonFundingLedgerUpdates'
        ? 500
        : 2000
    const sorted = rows
      .filter(
        (row) =>
          row.time >= Number(body.startTime ?? 0) &&
          row.time <= Number(body.endTime ?? Date.now())
      )
      .sort((a, b) => a.time - b.time)
    const page =
      body.type === 'userFills' ? sorted.slice(-cap) : sorted.slice(0, cap)
    return new Response(JSON.stringify(page), {
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return requests
}

const fillRows = (count: number): HlUserFills =>
  Array.from({ length: count }, (_, index) => ({
    ...HL_USER_FILLS[0],
    time: 1000 + Math.floor(index / 3),
    tid: index + 1,
    hash: `0xfill${index}`,
  }))

describe('Hyperliquid capped history pagination', () => {
  afterEach(() => vi.restoreAllMocks())

  describe.each([
    { name: 'fills', getHistory: getFills },
    { name: 'activity', getHistory: getActivity },
  ])('$name pagination input', ({ getHistory }) => {
    it.each([
      '1000:1',
      '1000',
      '{}',
      '[1000,"key",1001,2000]',
    ])('rejects an invalid or legacy cursor with ValidationError: %s', async (cursor) => {
      installHistory()
      await expect(
        getHistory(context(), { address: ADDRESS, cursor })
      ).rejects.toMatchObject({ code: PerpsErrorCode.ValidationError })
    })

    it.each([
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ])('rejects an invalid page limit with ValidationError: %s', async (limit) => {
      installHistory(fillRows(205), HL_USER_FUNDING)
      await expect(
        getHistory(context(), { address: ADDRESS, limit })
      ).rejects.toMatchObject({ code: PerpsErrorCode.ValidationError })
    })
  })

  it.each([
    false,
    true,
  ])('returns every retained fill newest-first beyond the 2000-row cap (bounded=%s)', async (bounded) => {
    const rows = fillRows(2305)
    const requests = installHistory(rows)
    const ctx = context()
    const bounds = bounded ? { startTime: 1000, endTime: 2000 } : {}
    const seen: string[] = []
    let cursor: string | undefined
    for (let page = 0; page < 20; page++) {
      const result = await getFills(ctx, {
        address: ADDRESS,
        limit: 200,
        ...bounds,
        cursor,
      })
      seen.push(...result.items.map((item) => item.id))
      if (!result.pagination.hasMore) {
        break
      }
      expect(result.pagination.cursor).toBeDefined()
      cursor = result.pagination.cursor
    }
    expect(seen).toEqual([...rows].reverse().map((row) => String(row.tid)))
    expect(requests.some((request) => request.type === 'userFillsByTime')).toBe(
      true
    )
    expect(
      requests.filter((request) => request.type === 'userFills')
    ).toHaveLength(bounded ? 0 : 1)
    expect(requests.length).toBeLessThan(100)
  })

  it.each([
    ActivityType.FUNDING,
    ActivityType.DEPOSIT,
  ])('traverses the 500-row cap for %s with inclusive bounded history', async (type) => {
    const funding: HlUserFunding = Array.from({ length: 1105 }, (_, index) => ({
      ...HL_USER_FUNDING[0],
      time: 1000 + index,
      hash: `0xfunding${index}`,
    }))
    const ledger: HlUserNonFundingLedgerUpdates = Array.from(
      { length: 1105 },
      (_, index) => ({
        time: 1000 + index,
        hash: `0xledger${index}`,
        delta: { type: index % 2 ? 'withdraw' : 'deposit', usdc: '1' },
      })
    )
    const requests = installHistory([], funding, ledger)
    const ctx = context()
    const seen: string[] = []
    let cursor: string | undefined
    for (let page = 0; page < 20; page++) {
      const result = await getActivity(ctx, {
        address: ADDRESS,
        limit: 100,
        startTime: 1000,
        endTime: 2104,
        type: [type],
        cursor,
      })
      seen.push(...result.items.map((item) => item.timestamp))
      if (!result.pagination.hasMore) {
        break
      }
      cursor = result.pagination.cursor
    }
    const expected = Array.from({ length: 1105 }, (_, index) => index)
      .filter((index) => type === ActivityType.FUNDING || index % 2 === 0)
      .reverse()
      .map((index) => new Date(1000 + index).toISOString())
    expect(seen).toEqual(expected)
    expect(
      requests.every(
        (request) =>
          Number(request.startTime) >= 1000 && Number(request.endTime) <= 2104
      )
    ).toBe(true)
    expect(requests.length).toBeLessThan(80)
  })

  it('keeps equal-time mixed activities across page boundaries and excludes new arrivals', async () => {
    const ledger: HlUserNonFundingLedgerUpdates = [
      { time: 1000, hash: '0xa', delta: { type: 'deposit', usdc: '1' } },
      { time: 1000, hash: '0xb', delta: { type: 'withdraw', usdc: '2' } },
      { time: 900, hash: '0xc', delta: { type: 'deposit', usdc: '3' } },
    ]
    installHistory([], [{ ...HL_USER_FUNDING[0], time: 1000 }], ledger)
    const ctx = context()
    const complete = await getActivity(ctx, { address: ADDRESS })
    ledger.reverse()
    const reordered = await getActivity(ctx, { address: ADDRESS })
    expect(reordered.items.map((item) => item.id)).toEqual(
      complete.items.map((item) => item.id)
    )
    const first = await getActivity(ctx, { address: ADDRESS, limit: 1 })
    ledger.push({
      time: 1100,
      hash: '0xnew',
      delta: { type: 'deposit', usdc: '4' },
    })
    const ids = first.items.map((item) => item.id)
    let cursor = first.pagination.cursor
    for (let page = 0; page < 4; page++) {
      const next = await getActivity(ctx, {
        address: ADDRESS,
        limit: 1,
        cursor,
      })
      ids.push(...next.items.map((item) => item.id))
      if (!next.pagination.hasMore) {
        break
      }
      cursor = next.pagination.cursor
    }
    expect([...ids].sort()).toEqual(
      ['0xa', '0xb', '0xc', 'funding:BTC:1970-01-01T00:00:01.000Z'].sort()
    )
    expect(ids).toEqual(complete.items.map((item) => item.id))
  })

  it('continues through excluded fills until the retained visible history is exhausted', async () => {
    const fills = fillRows(2305).map((fill, index) =>
      index < 2 ? fill : { ...fill, coin: '#26140' }
    )
    installHistory(fills)
    const result = await getFills(context(), {
      address: ADDRESS,
      startTime: 1000,
      endTime: 2000,
    })
    expect(result.items.map((item) => item.id)).toEqual(['2', '1'])
    expect(result.pagination.hasMore).toBe(false)
  })

  it('finds liquidation fills beyond the latest 2000 fills without returning ordinary trades', async () => {
    const fills = fillRows(2305)
    fills[0] = {
      ...fills[0],
      liquidation: {
        liquidatedUser: ADDRESS,
        markPx: '45000',
        method: 'market',
      },
    }
    installHistory(fills)
    const result = await getActivity(context(), {
      address: ADDRESS,
      type: [ActivityType.LIQUIDATION],
    })
    expect(result.items.map((item) => item.id)).toEqual([
      `liquidation:${fills[0].oid}`,
    ])
    expect(result.pagination.hasMore).toBe(false)
  })

  it('aggregates liquidation orders across capped time windows before applying SDK page boundaries', async () => {
    const fills = fillRows(2305)
    const liquidation = {
      liquidatedUser: ADDRESS,
      markPx: '45000',
      method: 'market' as const,
    }
    fills[0] = { ...fills[0], oid: 777, liquidation, sz: '1', px: '10' }
    fills[2304] = { ...fills[2304], oid: 777, liquidation, sz: '2', px: '20' }
    fills[100] = { ...fills[100], oid: 888, liquidation, sz: '3', px: '30' }
    installHistory(fills)
    const ctx = context()
    const first = await getActivity(ctx, {
      address: ADDRESS,
      limit: 1,
      type: [ActivityType.LIQUIDATION],
      startTime: 1000,
      endTime: 2000,
    })
    expect(first.items).toMatchObject([
      { id: 'liquidation:777', liquidatedNotionalPosition: '50' },
    ])
    const next = await getActivity(ctx, {
      address: ADDRESS,
      limit: 1,
      type: [ActivityType.LIQUIDATION],
      startTime: 1000,
      endTime: 2000,
      cursor: first.pagination.cursor,
    })
    expect(next.items.map((item) => item.id)).toEqual(['liquidation:888'])
    expect(next.pagination.hasMore).toBe(false)
  })

  it('keeps liquidation groups at the first-page snapshot when new fills arrive', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(2000)
    const liquidation = {
      liquidatedUser: ADDRESS,
      markPx: '45000',
      method: 'market' as const,
    }
    const fills: HlUserFills = [
      {
        ...HL_USER_FILLS[0],
        time: 1000,
        tid: 1,
        oid: 777,
        liquidation,
        sz: '1',
        px: '10',
      },
      {
        ...HL_USER_FILLS[0],
        time: 1500,
        tid: 2,
        oid: 888,
        liquidation,
        sz: '3',
        px: '10',
      },
    ]
    installHistory(fills)
    const ctx = context()
    const params = {
      address: ADDRESS,
      limit: 1,
      type: [ActivityType.LIQUIDATION],
    }
    const first = await getActivity(ctx, params)
    expect(first.items).toMatchObject([
      { id: 'liquidation:888', liquidatedNotionalPosition: '30' },
    ])
    expect(first.pagination.hasMore).toBe(true)
    fills.push({
      ...fills[0],
      time: 2500,
      tid: 3,
      sz: '9',
    })
    now.mockReturnValue(3000)
    const next = await getActivity(ctx, {
      ...params,
      cursor: first.pagination.cursor,
    })
    expect(next.items).toMatchObject([
      {
        id: 'liquidation:777',
        liquidatedNotionalPosition: '10',
        timestamp: '1970-01-01T00:00:01.000Z',
      },
    ])
    expect(next.pagination.hasMore).toBe(false)
  })

  it.each([
    0, 501,
  ])('keeps ledger-excluded liquidation fills out of order groups on every SDK page (%s unrelated rows)', async (count) => {
    const liquidation = {
      liquidatedUser: ADDRESS,
      markPx: '45000',
      method: 'market' as const,
    }
    const fills: HlUserFills = [
      {
        ...HL_USER_FILLS[0],
        time: 1000,
        tid: 1,
        oid: 777,
        hash: '0xfill-a',
        liquidation,
        sz: '1',
        px: '10',
      },
      {
        ...HL_USER_FILLS[0],
        time: 2000,
        tid: 2,
        oid: 777,
        hash: '0xfill-b',
        liquidation,
        sz: '2',
        px: '20',
      },
    ]
    const ledger: HlUserNonFundingLedgerUpdates = [
      {
        time: 2000,
        hash: '0xfill-b',
        delta: {
          type: 'liquidation',
          leverageType: 'cross',
          liquidatedPositions: [{ coin: 'BTC', szi: '2' }],
        },
      },
    ]
    for (let index = 0; index < count; index++) {
      ledger.push({
        time: 1001 + index,
        hash: `0xunrelated${index}`,
        delta: { type: 'deposit', usdc: '1' },
      })
    }
    installHistory(fills, [{ ...HL_USER_FUNDING[0], time: 1500 }], ledger)
    const ctx = context()
    const params = {
      address: ADDRESS,
      startTime: 0,
      endTime: 3000,
      limit: 2,
      type: [ActivityType.FUNDING, ActivityType.LIQUIDATION],
    }
    const first = await getActivity(ctx, params)
    expect(first.items.map((item) => item.id)).toEqual([
      '0xfill-b',
      'funding:BTC:1970-01-01T00:00:01.500Z',
    ])
    const second = await getActivity(ctx, {
      ...params,
      cursor: first.pagination.cursor,
    })
    expect(second.items).toMatchObject([
      {
        id: 'liquidation:777',
        liquidatedNotionalPosition: '10',
        timestamp: '1970-01-01T00:00:01.000Z',
      },
    ])
    expect(second.pagination.hasMore).toBe(false)
  })

  it('propagates a later time-window failure instead of returning truncated history', async () => {
    installHistory(fillRows(2305))
    const historyFetch = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (
        init?.method === 'POST' &&
        JSON.parse(String(init.body)).startTime > 1000
      ) {
        return new Response('upstream unavailable', { status: 503 })
      }
      return historyFetch(input, init)
    })
    await expect(
      getFills(context(), { address: ADDRESS, startTime: 1000, endTime: 2000 })
    ).rejects.toThrow()
  })

  it('cancels between capped windows without returning a partial page', async () => {
    const requests = installHistory(fillRows(2305))
    const historyFetch = vi.mocked(fetch).getMockImplementation()!
    const controller = new AbortController()
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const response = await historyFetch(input, init)
      if (requests.length === 1) {
        controller.abort()
      }
      return response
    })
    await expect(
      getFills(
        context(),
        { address: ADDRESS, startTime: 1000, endTime: 2000 },
        { signal: controller.signal }
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(requests).toHaveLength(1)
  })

  it.each([
    'failure',
    'abort',
  ])('rejects instead of returning partial liquidation groups on a later sweep %s', async (action) => {
    const fills = fillRows(2305)
    fills[0] = {
      ...fills[0],
      liquidation: {
        liquidatedUser: ADDRESS,
        markPx: '45000',
        method: 'market',
      },
    }
    installHistory(fills)
    const historyFetch = vi.mocked(fetch).getMockImplementation()!
    const controller = new AbortController()
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      if (body.type === 'userFillsByTime' && body.startTime > 1000) {
        if (action === 'failure') {
          return new Response('liquidation history unavailable', {
            status: 503,
          })
        }
        controller.abort()
      }
      return historyFetch(input, init)
    })
    const result = getActivity(
      context(),
      {
        address: ADDRESS,
        startTime: 1000,
        endTime: 2000,
        type: [ActivityType.LIQUIDATION],
      },
      { signal: controller.signal }
    )
    if (action === 'failure') {
      await expect(result).rejects.toBeInstanceOf(PerpsError)
    } else {
      await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    }
  })

  it('rejects a time-only endpoint saturated within one millisecond rather than claiming exhaustion', async () => {
    const rows = fillRows(2001).map((row) => ({ ...row, time: 1000 }))
    installHistory(rows)
    await expect(
      getFills(context(), { address: ADDRESS, startTime: 1000, endTime: 1000 })
    ).rejects.toThrow(/timestamp|millisecond|saturat/i)
  })
})
