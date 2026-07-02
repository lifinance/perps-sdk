import { createPerpsClient } from '@lifi/perps-sdk'
import { afterEach, describe, expect, it } from 'vitest'
import { HL_FRONTEND_OPEN_ORDERS, HL_MARKETS } from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getOrders } from './getOrders.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const client = createPerpsClient({
  integrator: 'test',
  apiKey: 'k',
  retry: false,
})

const baseResponses = {
  frontendOpenOrders: HL_FRONTEND_OPEN_ORDERS,
}

const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

describe('getOrders', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('splits limit and trigger orders and enriches their asset display fields', async () => {
    ;({ restore } = installInfoFetchMock(baseResponses, HL_MARKETS))

    const result = await getOrders(ctx, {
      address: ADDRESS,
    })

    expect(result.provider).toBe('hyperliquid')
    expect(result.openOrders).toHaveLength(1)
    expect(result.openOrders[0].market.categoryId).toBe('hyperliquid')
    expect(result.openOrders[0].market.quoteAsset.displaySymbol).toBe('USDC')
    expect(result.openOrders[0].orderId).toBe('1')
    expect(result.triggerOrders).toHaveLength(1)
    expect(result.triggerOrders[0].orderId).toBe('2')
    expect(result.triggerOrders[0].triggerPrice).toBe('90000')
  })

  it('promotes child TP/SL orders to the trigger orders list and drops their parent from open', async () => {
    const childOrder = {
      ...HL_FRONTEND_OPEN_ORDERS[1],
      oid: 99,
    }
    const parentWithChild = {
      ...HL_FRONTEND_OPEN_ORDERS[0],
      children: [childOrder],
    }
    ;({ restore } = installInfoFetchMock(
      {
        ...baseResponses,
        frontendOpenOrders: [parentWithChild, childOrder],
      },
      HL_MARKETS
    ))

    const result = await getOrders(ctx, {
      address: ADDRESS,
    })

    // child oid 99 was listed at top-level too; gets dropped from openOrders…
    expect(result.openOrders.map((o) => o.orderId)).toEqual(['1'])
    // …and surfaced under triggerOrders.
    expect(result.triggerOrders.map((o) => o.orderId)).toEqual(['99'])
  })

  it('maps an order that omits the `children` field entirely', async () => {
    const { children, ...orderWithoutChildren } = HL_FRONTEND_OPEN_ORDERS[0]
    ;({ restore } = installInfoFetchMock(
      {
        ...baseResponses,
        frontendOpenOrders: [orderWithoutChildren],
      },
      HL_MARKETS
    ))

    const result = await getOrders(ctx, {
      address: ADDRESS,
    })

    expect(result.openOrders).toHaveLength(1)
    expect(result.openOrders[0].orderId).toBe('1')
  })

  it('filters by marketId-matching `symbol`', async () => {
    ;({ restore } = installInfoFetchMock(baseResponses, HL_MARKETS))

    const result = await getOrders(ctx, {
      address: ADDRESS,
      marketId: 'ETH',
    })
    expect(result.openOrders).toHaveLength(0)
    expect(result.triggerOrders).toHaveLength(0)
  })
})
