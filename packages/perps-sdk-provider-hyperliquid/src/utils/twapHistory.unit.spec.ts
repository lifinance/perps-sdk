import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HL_TWAP_HISTORY_FINISHED,
  HL_TWAP_SLICE_FILLS,
} from '../../test/fixtures.js'
import {
  resolveLatestTwapEntries,
  resolveTwapExecution,
} from './twapHistory.js'

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

describe('resolveTwapExecution', () => {
  afterEach(() => vi.restoreAllMocks())

  it('takes the executed size and notional of an activated row from the slice fills of its twapId', () => {
    expect(resolveTwapExecution([activated], HL_TWAP_SLICE_FILLS)).toEqual([
      {
        ...activated,
        state: {
          ...activated.state,
          executedSz: '0.0094',
          executedNtl: '37.5154',
        },
      },
    ])
  })

  it.each([
    ['finished', finished],
    ['terminated', { ...finished, status: { status: 'terminated' } }],
    [
      'waitingForTrigger',
      { ...activated, status: { status: 'waitingForTrigger' } },
    ],
  ])('keeps the venue state of a %s row', (_, entry) => {
    expect(resolveTwapExecution([entry], HL_TWAP_SLICE_FILLS)).toEqual([entry])
  })

  it('keeps the venue state of an activated row with no slice fill', () => {
    const other = { ...activated, twapId: 7 }
    expect(resolveTwapExecution([other], HL_TWAP_SLICE_FILLS)).toEqual([other])
  })

  it('keeps the venue state and warns when a slice fill does not read', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const [first, ...rest] = HL_TWAP_SLICE_FILLS
    const sliceFills = [
      { ...first, fill: { ...first.fill, px: 'bad' } },
      ...rest,
    ]
    expect(resolveTwapExecution([activated], sliceFills)).toEqual([activated])
    expect(warn).toHaveBeenCalledOnce()
  })
})
