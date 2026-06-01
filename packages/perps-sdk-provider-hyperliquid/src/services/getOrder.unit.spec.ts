import { createPerpsClient } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HL_MARKETS,
  HL_ORDER_STATUS_FOUND,
  HL_ORDER_STATUS_UNKNOWN,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getOrder } from './getOrder.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const client = createPerpsClient({
  integrator: 'test',
  apiKey: 'k',
  retry: false,
})

const baseResponses = {}

describe('getOrder', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('normalises a found order and enriches its asset display fields', async () => {
    ;({ restore } = installInfoFetchMock(
      {
        ...baseResponses,
        orderStatus: HL_ORDER_STATUS_FOUND,
      },
      HL_MARKETS
    ))

    const order = await getOrder(client, DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
      id: '1',
    })

    expect(order.orderId).toBe('1')
    expect(order.market.categoryId).toBe('hyperliquid')
    expect(order.market.quoteAsset.displaySymbol).toBe('USDC')
  })

  it('throws OrderNotFound when the upstream status is unknownOid', async () => {
    ;({ restore } = installInfoFetchMock({
      ...baseResponses,
      orderStatus: HL_ORDER_STATUS_UNKNOWN,
    }))

    await expect(
      getOrder(client, DEFAULT_HYPERLIQUID_API_URL, {
        address: ADDRESS,
        id: '7',
      })
    ).rejects.toMatchObject({ code: PerpsErrorCode.OrderNotFound })
  })

  it('rejects non-numeric ids with a validation error before calling the venue', async () => {
    ;({ restore } = installInfoFetchMock({
      ...baseResponses,
      orderStatus: HL_ORDER_STATUS_UNKNOWN,
    }))

    await expect(
      getOrder(client, DEFAULT_HYPERLIQUID_API_URL, {
        address: ADDRESS,
        id: 'abc',
      })
    ).rejects.toMatchObject({ code: PerpsErrorCode.ValidationError })
  })
})
