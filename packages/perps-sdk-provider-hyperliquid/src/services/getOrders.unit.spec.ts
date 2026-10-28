import { createPerpsClient } from '@lifi/perps-sdk'
import {
  OrderStatus,
  OrderType,
  PerpsErrorCode,
  TimeInForce,
} from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HL_FRONTEND_OPEN_ORDERS,
  HL_MARKETS,
  HL_TWAP_HISTORY_FINISHED,
  HL_TWAP_LONG_ACTIVATED,
  HL_TWAP_LONG_SLICE_FILLS,
  HL_TWAP_SLICE_FILLS,
} from '../../test/fixtures.js'
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
const CLOID_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const CLOID_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const explorerTx = (hash: string, cloids: string[]) => ({
  time: 1_775_000_000_000,
  user: ADDRESS,
  action: { type: 'order', orders: cloids.map((c) => ({ a: 0, b: true, c })) },
  block: 100,
  hash,
  error: null,
})

describe('getOrders', () => {
  let restore: (() => void) | undefined
  afterEach(() => restore?.())

  it('returns regular and trigger rows with market display and running TWAPs', async () => {
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: HL_FRONTEND_OPEN_ORDERS,
        twapHistory: [activeTwap],
        userTwapSliceFills: [],
      },
      HL_MARKETS
    )
    restore = installed.restore
    const result = await getOrders(ctx, { address: ADDRESS })
    expect(installed.requests.map((request) => request.body.type)).toEqual([
      'preTransferCheck',
      'frontendOpenOrders',
      'twapHistory',
      'userTwapSliceFills',
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
      {
        frontendOpenOrders: [parent, sl],
        twapHistory: [],
        userTwapSliceFills: [],
      },
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
        userTwapSliceFills: [],
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
    expect(
      installed.requests.some(({ body }) => body.type === 'frontendOpenOrders')
    ).toBe(false)
    expect(orders.map((order) => [order.orderId, order.status])).toEqual([
      ['88', OrderStatus.FILLED],
      ['3155', OrderStatus.FILLED],
    ])
  })

  it('returns cancelled orders without depending on a running TWAP fill read', async () => {
    const installed = installInfoFetchMock(
      {
        historicalOrders: [
          {
            ...historical,
            order: { ...historical.order, sz: '0.2' },
            status: 'canceled',
          },
        ],
        twapHistory: [activeTwap],
        userTwapSliceFills: new Response('{}', { status: 503 }),
      },
      HL_MARKETS
    )
    restore = installed.restore

    const { orders } = await getOrders(ctx, {
      address: ADDRESS,
      statuses: [OrderStatus.CANCELLED],
    })

    expect(orders.map((order) => [order.orderId, order.status])).toEqual([
      ['88', OrderStatus.CANCELLED],
    ])
    expect(
      installed.requests.some(({ body }) => body.type === 'userTwapSliceFills')
    ).toBe(false)
  })

  it.each([
    ['empty history', []],
    ['a terminal newest row', HL_TWAP_HISTORY_FINISHED],
  ])('returns regular orders with %s while the slice-fill endpoint is unavailable', async (_, twapHistory) => {
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: HL_FRONTEND_OPEN_ORDERS,
        twapHistory,
        userTwapSliceFills: new Response('{}', { status: 429 }),
      },
      HL_MARKETS
    )
    restore = installed.restore

    const { orders } = await getOrders(ctx, { address: ADDRESS })

    expect(orders.map((order) => order.orderId)).toEqual(['1', '2'])
    expect(
      installed.requests.some(({ body }) => body.type === 'userTwapSliceFills')
    ).toBe(false)
  })

  it.each([
    [429, PerpsErrorCode.RateLimitExceeded],
    [503, PerpsErrorCode.ThirdPartyError],
  ])('rejects a running TWAP read when its slice fills fail with HTTP %s', async (status, code) => {
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: HL_FRONTEND_OPEN_ORDERS,
        twapHistory: [activeTwap],
        userTwapSliceFills: new Response('{}', { status }),
      },
      HL_MARKETS
    )
    restore = installed.restore

    await expect(getOrders(ctx, { address: ADDRESS })).rejects.toMatchObject({
      code,
      tool: 'hyperliquid',
    })
  })

  it('maps two running TWAPs from their own fills with one slice-fill read', async () => {
    const [, activated] = HL_TWAP_HISTORY_FINISHED
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: [],
        twapHistory: [activated, activeTwap],
        userTwapSliceFills: [
          ...HL_TWAP_SLICE_FILLS,
          {
            ...HL_TWAP_SLICE_FILLS[0],
            twapId: 3156,
            fill: {
              ...HL_TWAP_SLICE_FILLS[0].fill,
              coin: 'BTC',
              tid: 5003,
              oid: 4003,
              sz: '0.1',
              px: '90000',
            },
          },
        ],
      },
      HL_MARKETS
    )
    restore = installed.restore

    const { orders } = await getOrders(ctx, { address: ADDRESS })

    expect(orders).toEqual([
      expect.objectContaining({
        orderId: '2329352',
        status: OrderStatus.PARTIALLY_FILLED,
        filledSize: '0.0094',
        remainingSize: '0.0326',
        averagePrice: '3991',
      }),
      expect.objectContaining({
        orderId: '3156',
        status: OrderStatus.PARTIALLY_FILLED,
        filledSize: '0.1',
        remainingSize: '0.4',
        averagePrice: '90000',
      }),
    ])
    expect(
      installed.requests.filter(
        ({ body }) => body.type === 'userTwapSliceFills'
      )
    ).toHaveLength(1)
  })

  it.each([
    {
      name: 'mixed',
      statuses: [OrderStatus.PARTIALLY_FILLED, OrderStatus.FILLED],
      orderIds: ['2329352'],
    },
    {
      name: 'filled-only',
      statuses: [OrderStatus.FILLED],
      orderIds: ['2329352'],
    },
    {
      name: 'active-only',
      statuses: [OrderStatus.PARTIALLY_FILLED],
      orderIds: [],
    },
  ])('maps completed TWAPs for $name filters', async ({
    statuses,
    orderIds,
  }) => {
    const [, activated] = HL_TWAP_HISTORY_FINISHED
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: [],
        historicalOrders: [],
        twapHistory: [activated],
        userTwapSliceFills: [
          {
            ...HL_TWAP_SLICE_FILLS[0],
            fill: {
              ...HL_TWAP_SLICE_FILLS[0].fill,
              sz: '0.021',
              px: '3990',
            },
          },
          {
            ...HL_TWAP_SLICE_FILLS[2],
            fill: {
              ...HL_TWAP_SLICE_FILLS[2].fill,
              sz: '0.021',
              px: '4010',
            },
          },
        ],
      },
      HL_MARKETS
    )
    restore = installed.restore

    const { orders } = await getOrders(ctx, {
      address: ADDRESS,
      statuses,
    })

    expect(orders.map((order) => order.orderId)).toEqual(orderIds)
    for (const order of orders) {
      expect(order).toMatchObject({
        orderId: '2329352',
        status: OrderStatus.FILLED,
        originalSize: '0.042',
        filledSize: '0.042',
        remainingSize: '0',
        averagePrice: '4000',
      })
    }
  })

  it('maps a running TWAP from the slice fills of its twapId', async () => {
    const [, activated] = HL_TWAP_HISTORY_FINISHED
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: [],
        twapHistory: [activated],
        userTwapSliceFills: HL_TWAP_SLICE_FILLS,
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, { address: ADDRESS })
    expect(installed.requests.map((request) => request.body)).toContainEqual({
      type: 'userTwapSliceFills',
      user: ADDRESS,
    })
    expect(orders).toEqual([
      expect.objectContaining({
        orderId: '2329352',
        type: OrderType.TWAP,
        status: OrderStatus.PARTIALLY_FILLED,
        originalSize: '0.042',
        filledSize: '0.0094',
        remainingSize: '0.0326',
        averagePrice: '3991',
      }),
    ])
  })

  it('maps a running TWAP from all of its slice fills when the slice-fill window is full', async () => {
    const window = HL_TWAP_LONG_SLICE_FILLS.slice(-2000).reverse()
    const oldest = window[window.length - 1].fill.time
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: [],
        twapHistory: [HL_TWAP_LONG_ACTIVATED],
        userTwapSliceFills: window,
        userTwapSliceFillsByTime: HL_TWAP_LONG_SLICE_FILLS.slice(0, 1001),
      },
      HL_MARKETS
    )
    restore = installed.restore

    const { orders } = await getOrders(ctx, { address: ADDRESS })

    expect(orders).toEqual([
      expect.objectContaining({
        orderId: '2329400',
        status: OrderStatus.PARTIALLY_FILLED,
        filledSize: '30',
        remainingSize: '10',
        averagePrice: '120',
      }),
    ])
    expect(installed.requests.map(({ body }) => body)).toContainEqual({
      type: 'userTwapSliceFillsByTime',
      user: ADDRESS,
      startTime: HL_TWAP_LONG_ACTIVATED.state.timestamp,
      endTime: oldest,
    })
  })

  it('reads one slice-fill window when a full window reaches back to every running TWAP start', async () => {
    const window = HL_TWAP_LONG_SLICE_FILLS.slice(-2000).reverse()
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: [],
        twapHistory: [
          {
            ...HL_TWAP_LONG_ACTIVATED,
            twapId: 2329401,
            state: {
              ...HL_TWAP_LONG_ACTIVATED.state,
              timestamp: window[0].fill.time,
            },
          },
        ],
        userTwapSliceFills: window,
      },
      HL_MARKETS
    )
    restore = installed.restore

    const { orders } = await getOrders(ctx, { address: ADDRESS })

    expect(orders.map((order) => order.orderId)).toEqual(['2329401'])
    expect(installed.requests.map(({ body }) => body.type)).toEqual([
      'preTransferCheck',
      'frontendOpenOrders',
      'twapHistory',
      'userTwapSliceFills',
    ])
  })

  it('maps a TWAP from its newest twapHistory row', async () => {
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: [],
        historicalOrders: [],
        twapHistory: HL_TWAP_HISTORY_FINISHED,
        userTwapSliceFills: HL_TWAP_SLICE_FILLS,
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, {
      address: ADDRESS,
      statuses: [
        OrderStatus.OPEN,
        OrderStatus.PARTIALLY_FILLED,
        OrderStatus.FILLED,
      ],
    })
    expect(orders).toEqual([
      expect.objectContaining({
        orderId: '2329352',
        type: OrderType.TWAP,
        status: OrderStatus.FILLED,
        filledSize: '0.042',
        remainingSize: '0',
        averagePrice: '3990',
      }),
    ])
  })

  it('drops a finished TWAP from the default active filter', async () => {
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: [],
        twapHistory: HL_TWAP_HISTORY_FINISHED,
        userTwapSliceFills: HL_TWAP_SLICE_FILLS,
      },
      HL_MARKETS
    )
    restore = installed.restore
    expect((await getOrders(ctx, { address: ADDRESS })).orders).toEqual([])
  })

  it.each([
    ['terminated', OrderStatus.CANCELLED],
    ['error', OrderStatus.REJECTED],
  ])('maps a TWAP whose newest row is %s as %s', async (venueStatus, expected) => {
    const [newest, activated] = HL_TWAP_HISTORY_FINISHED
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: [],
        historicalOrders: [],
        userTwapSliceFills: [],
        twapHistory: [
          {
            ...newest,
            status: { status: venueStatus },
            state: { ...newest.state, executedSz: '0.021' },
          },
          activated,
        ],
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, {
      address: ADDRESS,
      statuses: [OrderStatus.OPEN, expected],
    })
    expect(orders.map((order) => [order.orderId, order.status])).toEqual([
      ['2329352', expected],
    ])
  })

  it('skips outcome market rows across the open and TWAP feeds', async () => {
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: [
          ...HL_FRONTEND_OPEN_ORDERS,
          { ...HL_FRONTEND_OPEN_ORDERS[0], oid: 3, coin: '#26140' },
        ],
        userTwapSliceFills: [],
        twapHistory: [
          activeTwap,
          {
            ...activeTwap,
            twapId: 3157,
            state: { ...activeTwap.state, coin: '#26140' },
          },
        ],
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, { address: ADDRESS })
    expect(orders.map((order) => order.orderId)).toEqual(['1', '2', '3156'])
  })

  it('keeps the newest row of an id when the terminal feed repeats it', async () => {
    const installed = installInfoFetchMock(
      {
        historicalOrders: [historical, { ...historical, status: 'open' }],
        twapHistory: [],
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, {
      address: ADDRESS,
      statuses: [OrderStatus.FILLED],
    })
    expect(orders.map((order) => [order.orderId, order.status])).toEqual([
      ['88', OrderStatus.FILLED],
    ])
  })

  it('reports no order when the newest row of an id is skipped', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const installed = installInfoFetchMock(
      {
        historicalOrders: [
          { ...historical, order: { ...historical.order, sz: 'bad' } },
          { ...historical, status: 'open' },
        ],
        frontendOpenOrders: [],
        twapHistory: [],
        userTwapSliceFills: [],
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, {
      address: ADDRESS,
      statuses: [
        OrderStatus.OPEN,
        OrderStatus.PARTIALLY_FILLED,
        OrderStatus.FILLED,
      ],
    })
    expect(orders).toEqual([])
    warn.mockRestore()
  })

  it('combines active and terminal feeds and filters the requested statuses', async () => {
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: HL_FRONTEND_OPEN_ORDERS,
        historicalOrders: [historical],
        twapHistory: [activeTwap],
        userTwapSliceFills: [],
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, {
      address: ADDRESS,
      statuses: [OrderStatus.OPEN, OrderStatus.FILLED],
    })
    expect(installed.requests.map((request) => request.body.type)).toEqual([
      'preTransferCheck',
      'frontendOpenOrders',
      'historicalOrders',
      'twapHistory',
      'userTwapSliceFills',
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
        userTwapSliceFills: [],
      },
      HL_MARKETS
    )
    restore = installed.restore
    expect(
      (await getOrders(ctx, { address: ADDRESS, marketId: 'ETH' })).orders
    ).toEqual([])
  })

  it('returns no orders after checking the account for an empty filter', async () => {
    const installed = installInfoFetchMock({}, HL_MARKETS)
    restore = installed.restore
    expect(
      (await getOrders(ctx, { address: ADDRESS, statuses: [] })).orders
    ).toEqual([])
    expect(installed.requests.map(({ body }) => body.type)).toEqual([
      'preTransferCheck',
    ])
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
        userTwapSliceFills: [],
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

  it('sets explorerLink from the placement transaction that names the cloid', async () => {
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: [
          { ...HL_FRONTEND_OPEN_ORDERS[0], cloid: CLOID_A },
          HL_FRONTEND_OPEN_ORDERS[1],
        ],
        twapHistory: [],
        userTwapSliceFills: [],
        userDetails: {
          txs: [
            explorerTx('0xunrelated', [CLOID_B]),
            explorerTx('0xplacement', [CLOID_A]),
          ],
        },
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, { address: ADDRESS })
    expect(orders[0]).toMatchObject({
      orderId: '1',
      clientOrderId: CLOID_A,
      explorerLink: 'https://app.hyperliquid.xyz/explorer/tx/0xplacement',
    })
    expect(orders[1]).not.toHaveProperty('explorerLink')
  })

  it('reads the explorer once for a page of rows', async () => {
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: [
          { ...HL_FRONTEND_OPEN_ORDERS[0], cloid: CLOID_A },
          { ...HL_FRONTEND_OPEN_ORDERS[1], cloid: CLOID_B },
        ],
        twapHistory: [],
        userTwapSliceFills: [],
        userDetails: { txs: [explorerTx('0xbatch', [CLOID_A, CLOID_B])] },
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, { address: ADDRESS })
    expect(
      installed.requests.filter(
        (request) => request.body.type === 'userDetails'
      )
    ).toHaveLength(1)
    expect(orders.map((order) => order.explorerLink)).toEqual([
      'https://app.hyperliquid.xyz/explorer/tx/0xbatch',
      'https://app.hyperliquid.xyz/explorer/tx/0xbatch',
    ])
  })

  it('skips the explorer read when no row carries a client order id', async () => {
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: HL_FRONTEND_OPEN_ORDERS,
        twapHistory: [],
        userTwapSliceFills: [],
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, { address: ADDRESS })
    expect(
      installed.requests.some(({ body }) => body.type === 'userDetails')
    ).toBe(false)
    expect(orders.every((order) => order.explorerLink === undefined)).toBe(true)
  })

  it('returns the rows unlinked when the explorer read fails, and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: [{ ...HL_FRONTEND_OPEN_ORDERS[0], cloid: CLOID_A }],
        twapHistory: [],
        userTwapSliceFills: [],
        userDetails: new Response('{}', { status: 503 }),
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, { address: ADDRESS })
    await getOrders(ctx, { address: ADDRESS })
    expect(orders[0]).not.toHaveProperty('explorerLink')
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      '[hyperliquid] explorer link lookup failed: Hyperliquid explorer userDetails failed: 503',
    ])
    warn.mockRestore()
  })

  it('returns the rows unlinked when the explorer answers 2xx with a body that is not JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const installed = installInfoFetchMock(
      {
        frontendOpenOrders: [{ ...HL_FRONTEND_OPEN_ORDERS[0], cloid: CLOID_A }],
        twapHistory: [],
        userTwapSliceFills: [],
        userDetails: new Response('<html>blocked</html>', { status: 200 }),
      },
      HL_MARKETS
    )
    restore = installed.restore
    const { orders } = await getOrders(ctx, { address: ADDRESS })
    expect(orders[0]).toMatchObject({ clientOrderId: CLOID_A })
    expect(orders[0]).not.toHaveProperty('explorerLink')
    warn.mockRestore()
  })

  it('links a filled row to its placement transaction', async () => {
    const installed = installInfoFetchMock(
      {
        historicalOrders: [
          { ...historical, order: { ...historical.order, cloid: CLOID_A } },
        ],
        twapHistory: [],
        userDetails: { txs: [explorerTx('0xplacement', [CLOID_A])] },
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
        orderId: '88',
        status: OrderStatus.FILLED,
        explorerLink: 'https://app.hyperliquid.xyz/explorer/tx/0xplacement',
      }),
    ])
  })
})
