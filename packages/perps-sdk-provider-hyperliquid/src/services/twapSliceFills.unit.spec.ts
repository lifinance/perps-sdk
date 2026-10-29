import { createPerpsClient } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HL_TWAP_HISTORY_FINISHED,
  HL_TWAP_LONG_ACTIVATED,
  HL_TWAP_LONG_SLICE_FILLS,
} from '../../test/fixtures.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import type { HlTwapSliceFill } from '../types/index.js'
import { hlInfoOptions } from '../utils/infoClient.js'
import { fetchTwapSliceFills } from './twapSliceFills.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const options = hlInfoOptions(
  createPerpsClient({ integrator: 'test', apiKey: 'k', retry: false })
)
const START = HL_TWAP_LONG_ACTIVATED.state.timestamp

/**
 * Serve `userTwapSliceFills` as the 2,000 newest rows, newest first, and
 * `userTwapSliceFillsByTime` as the first 2,000 rows of its inclusive range.
 */
const installVenue = (
  rows: HlTwapSliceFill[],
  byTime?: Response
): Record<string, unknown>[] => {
  const requests: Record<string, unknown>[] = []
  const newestFirst = [...rows].sort((a, b) => b.fill.time - a.fill.time)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    requests.push(body)
    if (body.type === 'userTwapSliceFills') {
      return Response.json(newestFirst.slice(0, 2000))
    }
    if (byTime !== undefined) {
      return byTime.clone()
    }
    return Response.json(
      newestFirst
        .filter(
          ({ fill }) =>
            fill.time >= Number(body.startTime) &&
            fill.time <= Number(body.endTime)
        )
        .reverse()
        .slice(0, 2000)
    )
  })
  return requests
}

const tids = (fills: HlTwapSliceFill[]): number[] =>
  fills.map(({ fill }) => fill.tid).sort((a, b) => a - b)

describe('fetchTwapSliceFills', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends no request when no entry is activated', async () => {
    const requests = installVenue(HL_TWAP_LONG_SLICE_FILLS)
    const [finished] = HL_TWAP_HISTORY_FINISHED

    await expect(
      fetchTwapSliceFills(
        DEFAULT_HYPERLIQUID_API_URL,
        ADDRESS,
        [finished],
        options
      )
    ).resolves.toEqual([])
    expect(requests).toEqual([])
  })

  it('reads one window when the window is not full', async () => {
    const rows = HL_TWAP_LONG_SLICE_FILLS.slice(0, 1999)
    const requests = installVenue(rows)

    const fills = await fetchTwapSliceFills(
      DEFAULT_HYPERLIQUID_API_URL,
      ADDRESS,
      [HL_TWAP_LONG_ACTIVATED],
      options
    )

    expect(tids(fills)).toEqual(tids(rows))
    expect(requests).toEqual([{ type: 'userTwapSliceFills', user: ADDRESS }])
  })

  it('reads one window when a full window reaches back to every TWAP start', async () => {
    const rows = HL_TWAP_LONG_SLICE_FILLS.slice(-2000)
    const requests = installVenue(rows)

    const fills = await fetchTwapSliceFills(
      DEFAULT_HYPERLIQUID_API_URL,
      ADDRESS,
      [
        {
          ...HL_TWAP_LONG_ACTIVATED,
          state: {
            ...HL_TWAP_LONG_ACTIVATED.state,
            timestamp: rows[0].fill.time + 1,
          },
        },
      ],
      options
    )

    expect(tids(fills)).toEqual(tids(rows))
    expect(requests).toEqual([{ type: 'userTwapSliceFills', user: ADDRESS }])
  })

  it('reads the rows older than a full window from the TWAP start, with the fills the window cuts at its oldest millisecond', async () => {
    const rows = HL_TWAP_LONG_SLICE_FILLS.map((row, index) =>
      index === 999
        ? {
            ...row,
            fill: {
              ...row.fill,
              time: HL_TWAP_LONG_SLICE_FILLS[1000].fill.time,
            },
          }
        : row
    )
    const requests = installVenue(rows)

    const fills = await fetchTwapSliceFills(
      DEFAULT_HYPERLIQUID_API_URL,
      ADDRESS,
      [HL_TWAP_LONG_ACTIVATED],
      options
    )

    expect(tids(fills)).toEqual(tids(rows))
    expect(requests).toEqual([
      { type: 'userTwapSliceFills', user: ADDRESS },
      {
        type: 'userTwapSliceFillsByTime',
        user: ADDRESS,
        startTime: START,
        endTime: rows[1000].fill.time,
      },
    ])
  })

  it('reads more than one capped by-time response from the oldest TWAP start', async () => {
    const rows = [
      ...HL_TWAP_LONG_SLICE_FILLS,
      ...HL_TWAP_LONG_SLICE_FILLS.map(({ fill }) => ({
        twapId: 2329401,
        fill: { ...fill, tid: fill.tid + 3_000, time: fill.time + 15_000 },
      })),
    ]
    const requests = installVenue(rows)
    const other = {
      ...HL_TWAP_LONG_ACTIVATED,
      twapId: 2329401,
      state: { ...HL_TWAP_LONG_ACTIVATED.state, timestamp: START + 15_000 },
    }

    const fills = await fetchTwapSliceFills(
      DEFAULT_HYPERLIQUID_API_URL,
      ADDRESS,
      [other, HL_TWAP_LONG_ACTIVATED],
      options
    )

    expect(tids(fills)).toEqual(tids(rows))
    expect(
      requests.filter(({ type }) => type === 'userTwapSliceFillsByTime')
    ).toContainEqual(expect.objectContaining({ startTime: START }))
  })

  it('rejects when the by-time read fails', async () => {
    installVenue(HL_TWAP_LONG_SLICE_FILLS, new Response('{}', { status: 503 }))

    await expect(
      fetchTwapSliceFills(
        DEFAULT_HYPERLIQUID_API_URL,
        ADDRESS,
        [HL_TWAP_LONG_ACTIVATED],
        options
      )
    ).rejects.toMatchObject({
      code: PerpsErrorCode.ThirdPartyError,
      tool: 'hyperliquid',
    })
  })
})
