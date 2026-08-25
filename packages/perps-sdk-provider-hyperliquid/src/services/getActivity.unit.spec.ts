import { createPerpsClient } from '@lifi/perps-sdk'
import { ActivityType } from '@lifi/perps-types'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HL_DELISTED_MARKET,
  HL_DELISTED_USER_FUNDING,
  HL_MARKETS,
  HL_USER_FUNDING,
  HL_USER_NON_FUNDING_LEDGER,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
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
