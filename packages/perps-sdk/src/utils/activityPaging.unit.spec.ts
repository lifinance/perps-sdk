import {
  ActivityType,
  type DepositActivity,
  type WithdrawalActivity,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { paginateActivity } from './activityPaging.js'

const deposit = (id: string, timestampMs: number): DepositActivity => ({
  id,
  provider: 'test',
  timestamp: new Date(timestampMs).toISOString(),
  type: ActivityType.DEPOSIT,
  asset: 'USDC',
  amount: '100',
})

const withdrawal = (id: string, timestampMs: number): WithdrawalActivity => ({
  id,
  provider: 'test',
  timestamp: new Date(timestampMs).toISOString(),
  type: ActivityType.WITHDRAWAL,
  asset: 'USDC',
  amount: '100',
})

describe('paginateActivity', () => {
  it('merges overflow ahead of fresh rows, sorts newest first, and slices to limit', () => {
    const overflow = [deposit('overflow-1', 1_000)]
    const fresh = [deposit('fresh-1', 3_000), deposit('fresh-2', 2_000)]

    const page = paginateActivity(
      fresh,
      overflow,
      { limit: 2 },
      () => 'next-cursor'
    )

    expect(page.items.map((it) => it.id)).toEqual(['fresh-1', 'fresh-2'])
    expect(page.pagination).toEqual({
      limit: 2,
      hasMore: true,
      cursor: 'next-cursor',
    })
  })

  it('reports no more pages and omits cursor when mintCursor returns undefined', () => {
    const page = paginateActivity(
      [deposit('d1', 1_000)],
      [],
      { limit: 10 },
      () => undefined
    )

    expect(page.pagination).toEqual({ limit: 10, hasMore: false })
  })

  it('applies the type filter to both overflow and fresh rows', () => {
    const overflow = [withdrawal('w1', 1_000)]
    const fresh = [deposit('d1', 2_000)]

    const page = paginateActivity(
      fresh,
      overflow,
      { type: [ActivityType.DEPOSIT] },
      () => undefined
    )

    expect(page.items.map((it) => it.id)).toEqual(['d1'])
  })

  it('applies startTime and endTime bounds', () => {
    const fresh = [
      deposit('too-early', 1_000),
      deposit('in-range', 2_000),
      deposit('too-late', 3_000),
    ]

    const page = paginateActivity(
      fresh,
      [],
      { startTime: 1_500, endTime: 2_500 },
      () => undefined
    )

    expect(page.items.map((it) => it.id)).toEqual(['in-range'])
  })

  it('passes the sliced-off tail to mintCursor as the new overflow', () => {
    const fresh = [
      deposit('a', 3_000),
      deposit('b', 2_000),
      deposit('c', 1_000),
    ]
    let capturedTail: string[] = []

    paginateActivity(fresh, [], { limit: 1 }, (tail) => {
      capturedTail = tail.map((it) => it.id)
      return undefined
    })

    expect(capturedTail).toEqual(['b', 'c'])
  })
})
