import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { HlLedgerUpdate } from '../types/index.js'
import { getLedgerHistory } from './getLedgerHistory.js'

const USER = '0x1234567890123456789012345678901234567890'
// Wire shapes: https://nktkas.gitbook.io/hyperliquid/api-reference/info-methods/usernonfundingledgerupdates
const rows: HlLedgerUpdate[] = Array.from({ length: 1101 }, (_, index) => ({
  time: Math.floor(index / 2),
  hash: `0x${index.toString(16).padStart(64, '0')}`,
  delta: { type: 'deposit', usdc: '0.01' },
}))

describe('getLedgerHistory', () => {
  it('reads all capped windows and retains equal-time boundary rows exactly once', async () => {
    const requests: { startTime: number; endTime: number }[] = []
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      expect(body.type).toBe('userNonFundingLedgerUpdates')
      expect(body.user).toBe(USER)
      requests.push(body)
      return Response.json(
        rows
          .filter(
            (row) => row.time >= body.startTime && row.time <= body.endTime
          )
          .slice(0, 500)
      )
    }
    const result = await getLedgerHistory(
      'https://venue.test',
      { user: USER, startTime: 0, endTime: 550 },
      { fetchImpl }
    )
    expect(result).toHaveLength(1101)
    expect(new Set(result.map((row) => row.hash)).size).toBe(1101)
    expect(result.some((row) => row.time === 0)).toBe(true)
    expect(result.some((row) => row.time === 550)).toBe(true)
    expect(requests.length).toBeGreaterThan(1)
  })

  it('rejects a saturated single timestamp instead of reporting partial coverage', async () => {
    const fetchImpl: typeof fetch = async () =>
      Response.json(
        Array.from({ length: 500 }, (_, index) => ({
          ...rows[index],
          time: 10,
        }))
      )
    await expect(
      getLedgerHistory(
        'https://venue.test',
        { user: USER, startTime: 10, endTime: 10 },
        { fetchImpl }
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.ThirdPartyError })
  })

  it('propagates ledger errors and cancellation', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response('failure', { status: 400 })
    await expect(
      getLedgerHistory(
        'https://venue.test',
        { user: USER, startTime: 10, endTime: 20 },
        { fetchImpl }
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.ThirdPartyError })
    const controller = new AbortController()
    const abortFetch: typeof fetch = async () => {
      controller.abort()
      return Response.json(rows.slice(0, 500))
    }
    await expect(
      getLedgerHistory(
        'https://venue.test',
        { user: USER, startTime: 0, endTime: 550 },
        { fetchImpl: abortFetch, signal: controller.signal }
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
