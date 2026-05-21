import { ActivityType } from '@lifi/perps-types'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HL_META_AND_CTXS_MAIN,
  HL_PERP_DEXS_MAIN_ONLY,
  HL_SPOT_META,
  HL_USER_FUNDING,
  HL_USER_NON_FUNDING_LEDGER,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getActivity } from './getActivity.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

const baseResponses = {
  perpDexs: HL_PERP_DEXS_MAIN_ONLY,
  metaAndAssetCtxs: HL_META_AND_CTXS_MAIN,
  spotMeta: HL_SPOT_META,
  userNonFundingLedgerUpdates: HL_USER_NON_FUNDING_LEDGER,
  userFunding: HL_USER_FUNDING,
}

describe('getActivity', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('merges ledger and funding entries newest-first and enriches funding assets', async () => {
    ;({ restore } = installInfoFetchMock(baseResponses))

    const result = await getActivity(DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
    })

    expect(result.provider).toBe('hyperliquid')
    expect(result.items).toHaveLength(2)
    const types = result.items.map((i) => i.type).sort()
    expect(types).toEqual([ActivityType.DEPOSIT, ActivityType.FUNDING].sort())
    const funding = result.items.find((i) => i.type === ActivityType.FUNDING)!
    if (funding.type === ActivityType.FUNDING) {
      expect(funding.asset.market).toBe('hyperliquid')
      expect(funding.asset.displayQuote).toBe('USDC')
    }
  })

  it('skips the userFunding call when type=[DEPOSIT]', async () => {
    const mock = installInfoFetchMock(baseResponses)
    restore = mock.restore

    await getActivity(DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
      type: [ActivityType.DEPOSIT],
    })

    expect(mock.requests.some((r) => r.body.type === 'userFunding')).toBe(false)
  })

  it('skips the ledger call when type=[FUNDING]', async () => {
    const mock = installInfoFetchMock(baseResponses)
    restore = mock.restore

    await getActivity(DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
      type: [ActivityType.FUNDING],
    })

    expect(
      mock.requests.some((r) => r.body.type === 'userNonFundingLedgerUpdates')
    ).toBe(false)
  })

  it('uses cursor to upper-bound results and emits a next cursor from the tail timestamp', async () => {
    ;({ restore } = installInfoFetchMock(baseResponses))

    const cursor = '1900000000000' // far future, includes both items
    const result = await getActivity(DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
      cursor,
    })

    expect(result.items).toHaveLength(2)
    expect(result.pagination.cursor).toBe(
      String(new Date(result.items[1].timestamp).getTime())
    )
  })
})
