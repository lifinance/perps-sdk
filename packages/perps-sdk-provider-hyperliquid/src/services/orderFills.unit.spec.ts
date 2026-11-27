import { createPerpsClient } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HL_REDUCE_ONLY_SHRUNK_ORDER,
  HL_REDUCE_ONLY_SHRUNK_ORDER_FILL,
} from '../../test/fixtures.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import type { HlFrontendOpenOrder, HlUserFill } from '../types/index.js'
import { hlInfoOptions } from '../utils/infoClient.js'
import { fetchTradedSizes, isFilledSizeAmbiguous } from './orderFills.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const options = hlInfoOptions(
  createPerpsClient({ integrator: 'test', apiKey: 'k', retry: false })
)
const START = HL_REDUCE_ONLY_SHRUNK_ORDER.timestamp

const order = (
  oid: number,
  overrides: Partial<HlFrontendOpenOrder> = {}
): HlFrontendOpenOrder => ({
  ...HL_REDUCE_ONLY_SHRUNK_ORDER,
  oid,
  ...overrides,
})

const fill = (
  tid: number,
  oid: number,
  time: number,
  sz = '0.0001'
): HlUserFill => ({ ...HL_REDUCE_ONLY_SHRUNK_ORDER_FILL, tid, oid, time, sz })

/**
 * Serve `userFills` as the 2,000 newest retained rows, newest first, and
 * `userFillsByTime` as the first 2,000 retained rows of its inclusive range.
 */
const installVenue = (
  retained: HlUserFill[],
  recent?: Response
): Record<string, unknown>[] => {
  const requests: Record<string, unknown>[] = []
  const newestFirst = [...retained].sort((a, b) => b.time - a.time)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    requests.push(body)
    if (body.type === 'userFills') {
      return recent?.clone() ?? Response.json(newestFirst.slice(0, 2000))
    }
    return Response.json(
      newestFirst
        .filter(
          ({ time }) =>
            time >= Number(body.startTime) && time <= Number(body.endTime)
        )
        .reverse()
        .slice(0, 2000)
    )
  })
  return requests
}

describe('isFilledSizeAmbiguous', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    ['a shrunk reduce-only row', order(41), true],
    [
      'a reduce-only row at its original size',
      order(41, { sz: '0.0004' }),
      false,
    ],
    ['a row that is not reduce-only', order(41, { reduceOnly: false }), false],
    ['a row with an invalid size', order(41, { sz: 'bad' }), false],
  ])('gives %s', (_, row, expected) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(isFilledSizeAmbiguous(row)).toBe(expected)
  })
})

describe('fetchTradedSizes', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends no request when no filled size is ambiguous', async () => {
    const requests = installVenue([])

    await expect(
      fetchTradedSizes(
        DEFAULT_HYPERLIQUID_API_URL,
        ADDRESS,
        [order(41, { reduceOnly: false }), order(42, { sz: '0.0004' })],
        options
      )
    ).resolves.toEqual(new Map())
    expect(requests).toEqual([])
  })

  it('sums the fills of each ambiguous order and gives zero for an order without a fill', async () => {
    const requests = installVenue([
      fill(1, 41, START + 1_000),
      fill(2, 41, START + 2_000, '0.00005'),
      fill(3, 40, START + 3_000, '5'),
    ])

    const tradedSizes = await fetchTradedSizes(
      DEFAULT_HYPERLIQUID_API_URL,
      ADDRESS,
      [order(41), order(42), order(43, { reduceOnly: false })],
      options
    )

    expect(tradedSizes).toEqual(
      new Map([
        [41, '0.00015'],
        [42, '0'],
      ])
    )
    expect(requests).toEqual([{ type: 'userFills', user: ADDRESS }])
  })

  it('reads the fills older than a full window from the oldest order', async () => {
    const retained = [
      fill(0, 41, START + 1),
      ...Array.from({ length: 2_000 }, (_, index) =>
        fill(index + 1, 40, START + 1_000 + index)
      ),
    ]
    const requests = installVenue(retained)

    const tradedSizes = await fetchTradedSizes(
      DEFAULT_HYPERLIQUID_API_URL,
      ADDRESS,
      [order(41)],
      options
    )

    expect(tradedSizes).toEqual(new Map([[41, '0.0001']]))
    expect(requests).toContainEqual({
      type: 'userFillsByTime',
      user: ADDRESS,
      startTime: START,
      endTime: START + 1_000,
    })
  })

  it('gives no entry for an order older than the retained fills', async () => {
    const retained = Array.from({ length: 10_000 }, (_, index) =>
      fill(index, index === 9_000 ? 42 : 40, START + 1_000 + index)
    )
    installVenue(retained)

    const tradedSizes = await fetchTradedSizes(
      DEFAULT_HYPERLIQUID_API_URL,
      ADDRESS,
      [order(41), order(42, { timestamp: START + 1_000 + 8_999 })],
      options
    )

    expect(tradedSizes).toEqual(new Map([[42, '0.0001']]))
  })

  it('gives no entry for an order created at the time of the oldest retained fill', async () => {
    const retained = Array.from({ length: 10_000 }, (_, index) =>
      fill(index, 40, START + 1_000 + index)
    )
    installVenue(retained)

    await expect(
      fetchTradedSizes(
        DEFAULT_HYPERLIQUID_API_URL,
        ADDRESS,
        [order(41, { timestamp: START + 1_000 })],
        options
      )
    ).resolves.toEqual(new Map())
  })

  it('gives no entry for an order with an invalid fill size', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    installVenue([fill(1, 41, START + 1_000, 'bad')])

    await expect(
      fetchTradedSizes(
        DEFAULT_HYPERLIQUID_API_URL,
        ADDRESS,
        [order(41)],
        options
      )
    ).resolves.toEqual(new Map())
  })

  it('rejects when the fill read fails', async () => {
    installVenue([], new Response('{}', { status: 503 }))

    await expect(
      fetchTradedSizes(
        DEFAULT_HYPERLIQUID_API_URL,
        ADDRESS,
        [order(41)],
        options
      )
    ).rejects.toMatchObject({
      code: PerpsErrorCode.ThirdPartyError,
      tool: 'hyperliquid',
    })
  })
})
