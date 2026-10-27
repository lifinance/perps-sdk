import { describe, expect, it } from 'vitest'
import { HL_TWAP_HISTORY_FINISHED } from '../../test/fixtures.js'
import { resolveLatestTwapEntries } from './twapHistory.js'

const [finished, activated] = HL_TWAP_HISTORY_FINISHED

describe('resolveLatestTwapEntries', () => {
  it.each([
    ['newest first', [finished, activated]],
    ['oldest first', [activated, finished]],
  ])('keeps the newest row of a TWAP when the feed lists rows %s', (_, rows) => {
    expect(resolveLatestTwapEntries(rows)).toEqual([finished])
  })

  it('keeps the earlier row when two rows of a TWAP share a time', () => {
    const terminated = {
      ...activated,
      time: finished.time,
      status: { status: 'terminated' },
    }
    expect(resolveLatestTwapEntries([finished, terminated])).toEqual([finished])
  })

  it('keeps one row per TWAP in first-seen id order', () => {
    const other = { ...activated, twapId: 7, time: finished.time + 1 }
    expect(resolveLatestTwapEntries([other, finished, activated])).toEqual([
      other,
      finished,
    ])
  })
})
