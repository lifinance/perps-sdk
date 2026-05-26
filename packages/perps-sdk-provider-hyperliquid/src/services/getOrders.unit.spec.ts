import { afterEach, describe, expect, it } from 'vitest'
import {
  HL_ASSET_CONTEXT,
  HL_FRONTEND_OPEN_ORDERS,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getOrders } from './getOrders.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

const baseResponses = {
  frontendOpenOrders: HL_FRONTEND_OPEN_ORDERS,
}

describe('getOrders', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('splits limit and trigger orders and enriches their asset display fields', async () => {
    ;({ restore } = installInfoFetchMock(baseResponses))

    const result = await getOrders(
      DEFAULT_HYPERLIQUID_API_URL,
      { address: ADDRESS },
      HL_ASSET_CONTEXT
    )

    expect(result.provider).toBe('hyperliquid')
    expect(result.openOrders).toHaveLength(1)
    expect(result.openOrders[0].asset.market).toBe('hyperliquid')
    expect(result.openOrders[0].asset.displayQuote).toBe('USDC')
    expect(result.openOrders[0].id).toBe('1')
    expect(result.triggerOrders).toHaveLength(1)
    expect(result.triggerOrders[0].id).toBe('2')
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
    ;({ restore } = installInfoFetchMock({
      ...baseResponses,
      frontendOpenOrders: [parentWithChild, childOrder],
    }))

    const result = await getOrders(
      DEFAULT_HYPERLIQUID_API_URL,
      { address: ADDRESS },
      HL_ASSET_CONTEXT
    )

    // child oid 99 was listed at top-level too; gets dropped from openOrders…
    expect(result.openOrders.map((o) => o.id)).toEqual(['1'])
    // …and surfaced under triggerOrders.
    expect(result.triggerOrders.map((o) => o.id)).toEqual(['99'])
  })

  it('filters by assetId-matching `symbol`', async () => {
    ;({ restore } = installInfoFetchMock(baseResponses))

    const result = await getOrders(
      DEFAULT_HYPERLIQUID_API_URL,
      { address: ADDRESS, assetId: 'ETH' },
      HL_ASSET_CONTEXT
    )
    expect(result.openOrders).toHaveLength(0)
    expect(result.triggerOrders).toHaveLength(0)
  })
})
