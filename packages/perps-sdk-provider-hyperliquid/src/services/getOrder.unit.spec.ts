import { PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HL_META_AND_CTXS_MAIN,
  HL_ORDER_STATUS_FOUND,
  HL_ORDER_STATUS_UNKNOWN,
  HL_PERP_DEXS_MAIN_ONLY,
  HL_SPOT_META,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getOrder } from './getOrder.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

const baseResponses = {
  perpDexs: HL_PERP_DEXS_MAIN_ONLY,
  metaAndAssetCtxs: HL_META_AND_CTXS_MAIN,
  spotMeta: HL_SPOT_META,
}

describe('getOrder', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('normalises a found order and enriches its asset display fields', async () => {
    ;({ restore } = installInfoFetchMock({
      ...baseResponses,
      orderStatus: HL_ORDER_STATUS_FOUND,
    }))

    const order = await getOrder(DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
      id: '1',
    })

    expect(order.orderId).toBe('1')
    expect(order.asset.market).toBe('hyperliquid')
    expect(order.asset.displayQuote).toBe('USDC')
  })

  it('throws OrderNotFound when the upstream status is unknownOid', async () => {
    ;({ restore } = installInfoFetchMock({
      ...baseResponses,
      orderStatus: HL_ORDER_STATUS_UNKNOWN,
    }))

    await expect(
      getOrder(DEFAULT_HYPERLIQUID_API_URL, { address: ADDRESS, id: '7' })
    ).rejects.toMatchObject({ code: PerpsErrorCode.OrderNotFound })
  })

  it('rejects non-numeric ids with a validation error before calling the venue', async () => {
    ;({ restore } = installInfoFetchMock({
      ...baseResponses,
      orderStatus: HL_ORDER_STATUS_UNKNOWN,
    }))

    await expect(
      getOrder(DEFAULT_HYPERLIQUID_API_URL, { address: ADDRESS, id: 'abc' })
    ).rejects.toMatchObject({ code: PerpsErrorCode.ValidationError })
  })
})
