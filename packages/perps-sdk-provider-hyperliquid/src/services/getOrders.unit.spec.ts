import { createPerpsClient } from '@lifi/perps-sdk'
import { OrderStatus, OrderType, TimeInForce } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HL_FRONTEND_OPEN_ORDERS, HL_MARKETS } from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getOrders } from './getOrders.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const client = createPerpsClient({
  integrator: 'orders-test',
  apiKey: 'test-key',
  retry: false,
})
const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }
const activeTwap = {
  time: 1_775_000_000,
  twapId: 3156,
  state: {
    coin: 'BTC',
    executedNtl: '19000',
    executedSz: '0.2',
    minutes: 15,
    randomize: true,
    reduceOnly: false,
    side: 'B',
    stopPx: null,
    sz: '0.5',
    timestamp: 1_775_000_000_000,
    trigger: null,
    user: ADDRESS,
  },
  status: { status: 'activated' },
}
const historical = {
  order: { ...HL_FRONTEND_OPEN_ORDERS[0], oid: 88, sz: '0' },
  status: 'filled',
  statusTimestamp: 1_775_000_000_000,
}

describe('getOrders', () => {
  let restore: (() => void) | undefined
  afterEach(() => restore?.())

  it('returns regular and trigger rows with market display and running TWAPs', async () => {
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: HL_FRONTEND_OPEN_ORDERS,
        twapHistory: [activeTwap],
      },
      HL_MARKETS
    )
    restore = installed.restore
    const result = await getOrders(ctx, { address: ADDRESS })
    expect(installed.requests.map((request) => request.body.type)).toEqual([
      'frontendOpenOrders',
      'twapHistory',
    ])
    expect(result.orders.map((order) => order.orderId)).toEqual([
      '1',
      '2',
      '3156',
    ])
    expect(result.orders[0].market.quoteAsset.displaySymbol).toBe('USDC')
    expect(result.orders[1]).toMatchObject({
      type: OrderType.STOP_MARKET,
      triggerPrice: '90000',
    })
    expect(result.orders[2]).toMatchObject({
      type: OrderType.TWAP,
      originalSize: '0.5',
      remainingSize: '0.3',
      filledSize: '0.2',
      averagePrice: '95000',
      durationSeconds: 900,
      status: OrderStatus.PARTIALLY_FILLED,
    })
  })

  it('extracts both attached legs once and retains their parent', async () => {
    const sl = { ...HL_FRONTEND_OPEN_ORDERS[1], oid: 99 }
    const tp = { ...sl, oid: 100, orderType: 'Take Profit Market' }
    const parent = { ...HL_FRONTEND_OPEN_ORDERS[0], children: [sl, tp] }
    const installed = installInfoFetchMock(
      { frontendOpenOrders: [parent, sl], twapHistory: [] },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, { address: ADDRESS })
    expect(orders.map((order) => order.orderId)).toEqual(['1', '99', '100'])
    expect(orders[0]).not.toHaveProperty('parentOrderId')
    expect(orders.slice(1)).toEqual([
      expect.objectContaining({
        orderId: '99',
        parentOrderId: '1',
        status: OrderStatus.PENDING,
      }),
      expect.objectContaining({
        orderId: '100',
        parentOrderId: '1',
        status: OrderStatus.PENDING,
      }),
    ])
  })

  it('uses historicalOrders for terminal filters and includes finished TWAPs', async () => {
    const installed = installInfoFetchMock(
      {
        historicalOrders: [historical],
        twapHistory: [
          activeTwap,
          { ...activeTwap, twapId: 3155, status: { status: 'finished' } },
        ],
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, {
      address: ADDRESS,
      statuses: [OrderStatus.FILLED],
    })
    expect(installed.requests.map((request) => request.body)).toEqual([
      { type: 'historicalOrders', user: ADDRESS },
      { type: 'twapHistory', user: ADDRESS },
    ])
    expect(orders.map((order) => [order.orderId, order.status])).toEqual([
      ['88', OrderStatus.FILLED],
      ['3155', OrderStatus.FILLED],
    ])
  })

  it('combines active and terminal feeds and filters the requested statuses', async () => {
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: HL_FRONTEND_OPEN_ORDERS,
        historicalOrders: [historical],
        twapHistory: [activeTwap],
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, {
      address: ADDRESS,
      statuses: [OrderStatus.OPEN, OrderStatus.FILLED],
    })
    expect(installed.requests.map((request) => request.body.type)).toEqual([
      'frontendOpenOrders',
      'historicalOrders',
      'twapHistory',
    ])
    expect(orders.some((order) => order.orderId === '88')).toBe(true)
    expect(
      orders.every(
        (order) =>
          order.status === OrderStatus.OPEN ||
          order.status === OrderStatus.FILLED
      )
    ).toBe(true)
    expect(orders.some((order) => order.orderId === '3156')).toBe(false)
  })

  it('filters regular and TWAP rows by the opaque market id', async () => {
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: HL_FRONTEND_OPEN_ORDERS,
        twapHistory: [activeTwap],
      },
      HL_MARKETS
    )
    restore = installed.restore
    expect(
      (await getOrders(ctx, { address: ADDRESS, marketId: 'ETH' })).orders
    ).toEqual([])
  })

  it('returns no orders and makes no requests for an empty filter', async () => {
    const installed = installInfoFetchMock({}, HL_MARKETS)
    restore = installed.restore
    expect(
      (await getOrders(ctx, { address: ADDRESS, statuses: [] })).orders
    ).toEqual([])
    expect(installed.requests).toEqual([])
  })

  it('maps a liquidation market order from the terminal feed', async () => {
    const installed = installInfoFetchMock(
      {
        historicalOrders: [
          {
            ...historical,
            order: {
              ...historical.order,
              oid: 89,
              orderType: 'Market',
              tif: 'LiquidationMarket',
            },
          },
        ],
        twapHistory: [],
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, {
      address: ADDRESS,
      statuses: [OrderStatus.FILLED],
    })
    expect(orders).toEqual([
      expect.objectContaining({
        orderId: '89',
        type: OrderType.MARKET,
        timeInForce: TimeInForce.IOC,
        status: OrderStatus.FILLED,
      }),
    ])
  })

  it('drops a row whose coin the market list does not hold and keeps the rest', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: [
          HL_FRONTEND_OPEN_ORDERS[0],
          { ...HL_FRONTEND_OPEN_ORDERS[1], coin: 'GHOST' },
        ],
        twapHistory: [],
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, { address: ADDRESS })
    expect(orders.map((order) => order.orderId)).toEqual(['1'])
    expect(warn).toHaveBeenCalledWith("[hyperliquid] unknown market id 'GHOST'")
    warn.mockRestore()
  })

  it('drops a row the mapper rejects and warns once per message', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const installed = installInfoFetchMock(
      {
        historicalOrders: [
          historical,
          {
            ...historical,
            order: { ...historical.order, oid: 90 },
            status: 'unexpected',
          },
          {
            ...historical,
            order: { ...historical.order, oid: 91 },
            status: 'unexpected',
          },
        ],
        twapHistory: [{ ...activeTwap, twapId: undefined }],
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, {
      address: ADDRESS,
      statuses: [OrderStatus.FILLED],
    })
    expect(orders.map((order) => order.orderId)).toEqual(['88'])
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      '[hyperliquid] dropped order row: Unknown Hyperliquid order status: unexpected',
      '[hyperliquid] dropped order row: Hyperliquid returned a TWAP without a twapId.',
    ])
    warn.mockRestore()
  })
})
