import {
  createMemoryStorage,
  createPerpsClient,
  PerpsError,
} from '@lifi/perps-sdk'
import {
  type Market,
  OrderStatus,
  OrderType,
  PositionMarginAdjustment,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { OndoTokenStore } from './auth/OndoTokenStore.js'
import { ondoProvider } from './OndoProvider.js'
import type { OndoOrder, OndoTwapOrder } from './types/wire.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const API_URL = 'https://ondo.test'
const MARKET: Market = {
  providerId: 'ondo',
  id: 'TSLA-USD.P',
  categoryId: 'ondo',
  baseAsset: {
    providerId: 'ondo',
    id: 'TSLA',
    displaySymbol: 'TSLA',
    logoURI: '',
    displayName: 'Tesla',
    decimals: 18,
  },
  quoteAsset: {
    providerId: 'ondo',
    id: 'USD',
    displaySymbol: 'USD',
    logoURI: '',
    displayName: 'US Dollar',
    decimals: 6,
  },
  szDecimals: 3,
  priceDecimals: 2,
  maxLeverage: 20,
  onlyIsolated: false,
  positionMarginAdjustment: PositionMarginAdjustment.NONE,
}
const orderFixture = (overrides: Partial<OndoOrder> = {}): OndoOrder => ({
  orderId: 'order-1',
  market: MARKET.id,
  side: 'buy',
  price: '250',
  size: '12',
  filledSize: '0',
  lastFillSize: '0',
  filledCost: '0',
  fee: '0',
  status: 'open',
  createdAt: '2026-04-01T14:30:00Z',
  type: 'limit',
  timeInForce: 'GTC',
  ...overrides,
})
const twapFixture = (
  overrides: Partial<OndoTwapOrder> = {}
): OndoTwapOrder => ({
  twapId: 'twap-1',
  market: MARKET.id,
  side: 'sell',
  startTime: '2026-04-01T14:30:00Z',
  runningTime: 1800,
  frequency: 60,
  avgFilledPrice: '248.25',
  filledSize: '3',
  totalSize: '12',
  totalFees: '1.14',
  orderStatus: 'running',
  reduceOnly: false,
  ...overrides,
})
type Page = {
  result: (OndoOrder | OndoTwapOrder)[] | OndoOrder | OndoTwapOrder | null
  pageInfo?: { nextCursor: string }
}

const setup = async (
  route: (url: URL) => Page | Response,
  authenticated = true
) => {
  const storage = createMemoryStorage()
  if (authenticated) {
    await new OndoTokenStore(storage, API_URL).set(ADDRESS, {
      identifier: ADDRESS,
      authType: 'siwe',
      accountId: 'account-1',
      issuedAtSecs: Math.floor(Date.now() / 1000) - 60,
      expirationSecs: Math.floor(Date.now() / 1000) + 3600,
      token: 'session-jwt',
    })
  }
  const requests: { url: URL; authorization: string | null }[] = []
  const client = createPerpsClient({
    integrator: 'order-test',
    apiKey: 'test-key',
    retry: false,
    fetch: async (input, init) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/markets')) {
        return Response.json({ markets: [MARKET] })
      }
      requests.push({
        url,
        authorization: new Headers(init?.headers).get('Authorization'),
      })
      const response = route(url)
      return response instanceof Response
        ? response
        : Response.json({ success: true, ...response })
    },
    providers: [ondoProvider({ apiUrl: API_URL, storage })],
  })
  const provider = client.getProvider('ondo')
  if (provider === undefined) {
    throw new Error('Ondo provider was not registered')
  }
  return { provider, requests }
}

describe('Ondo getOrders', () => {
  it('combines active regular orders and running TWAPs with the default status filter', async () => {
    const { provider, requests } = await setup((url) => ({
      result:
        url.pathname === '/v1/perps/orders'
          ? [
              orderFixture(),
              orderFixture({ orderId: 'terminal', status: 'canceled' }),
            ]
          : [
              twapFixture(),
              twapFixture({
                twapId: 'twap-unfilled',
                filledSize: '0',
                avgFilledPrice: '0',
              }),
            ],
    }))
    const result = await provider.getOrders({
      address: ADDRESS,
      marketId: MARKET.id,
    })
    expect(result.orders.map((order) => [order.orderId, order.status])).toEqual(
      [
        ['order-1', OrderStatus.OPEN],
        ['twap-1', OrderStatus.PARTIALLY_FILLED],
        ['twap-unfilled', OrderStatus.OPEN],
      ]
    )
    expect(result.orders[1]).toMatchObject({
      type: OrderType.TWAP,
      remainingSize: '9',
      averagePrice: '248.25',
      durationSeconds: 1800,
    })
    expect(result.orders[2]).not.toHaveProperty('averagePrice')
    expect(requests.map(({ url }) => url.pathname)).toEqual([
      '/v1/perps/orders',
      '/v1/perps/twap/orders/running',
    ])
    expect(requests[0]?.url.searchParams.get('activeOnly')).toBe('true')
    expect(requests[0]?.url.searchParams.has('status')).toBe(false)
    for (const request of requests) {
      expect(request.url.searchParams.get('market')).toBe(MARKET.id)
      expect(request.authorization).toBe('Bearer session-jwt')
    }
  })
  it('reads terminal regular orders and finished TWAPs from the history queries', async () => {
    const { provider, requests } = await setup((url) => ({
      result:
        url.pathname === '/v1/perps/twap/orders/history'
          ? [
              twapFixture({
                orderStatus: 'completed',
                filledSize: '12',
                finishTime: '2026-04-01T15:00:00Z',
              }),
            ]
          : [orderFixture({ status: 'fullyfilled', filledSize: '12' })],
    }))
    const result = await provider.getOrders({
      address: ADDRESS,
      statuses: [OrderStatus.FILLED],
    })
    expect(requests.map(({ url }) => url.pathname)).toEqual([
      '/v1/perps/orders',
      '/v1/perps/twap/orders/history',
    ])
    expect(requests[0]?.url.searchParams.has('activeOnly')).toBe(false)
    expect(requests[0]?.url.searchParams.has('status')).toBe(false)
    expect(result.orders.map((order) => [order.type, order.status])).toEqual([
      [OrderType.LIMIT, OrderStatus.FILLED],
      [OrderType.TWAP, OrderStatus.FILLED],
    ])
  })
  it('reads the unfiltered order list once for a mixed filter and keeps only the requested statuses', async () => {
    const { provider, requests } = await setup((url) => ({
      result:
        url.pathname === '/v1/perps/orders'
          ? [
              orderFixture(),
              orderFixture({
                orderId: 'terminal',
                status: 'canceled',
                cancelReason: 'liquidation',
              }),
              orderFixture({
                orderId: 'filled',
                status: 'fullyfilled',
                filledSize: '12',
              }),
            ]
          : [],
    }))
    const result = await provider.getOrders({
      address: ADDRESS,
      statuses: [OrderStatus.OPEN, OrderStatus.CANCELLED],
    })
    expect(requests.map(({ url }) => url.pathname + url.search)).toEqual([
      '/v1/perps/orders',
      '/v1/perps/twap/orders/running',
      '/v1/perps/twap/orders/history',
    ])
    expect(result.orders.map((order) => [order.orderId, order.status])).toEqual(
      [
        ['order-1', OrderStatus.OPEN],
        ['terminal', OrderStatus.CANCELLED],
      ]
    )
    expect(result.orders[1]).toMatchObject({ statusReason: 'liquidation' })
  })
  it('filters open rows by partial fill status and excludes other markets', async () => {
    const { provider } = await setup((url) => ({
      result:
        url.pathname === '/v1/perps/orders'
          ? [
              orderFixture(),
              orderFixture({ orderId: 'partial', filledSize: '1' }),
              orderFixture({
                orderId: 'other',
                market: 'OTHER',
                filledSize: '1',
              }),
            ]
          : [],
    }))
    expect(
      (
        await provider.getOrders({
          address: ADDRESS,
          marketId: MARKET.id,
          statuses: [OrderStatus.PARTIALLY_FILLED],
        })
      ).orders
    ).toEqual([
      expect.objectContaining({
        orderId: 'partial',
        status: OrderStatus.PARTIALLY_FILLED,
      }),
    ])
  })
  it('retains independent regular and TWAP cursors without dropping a partial page', async () => {
    const { provider, requests } = await setup((url) => {
      if (url.pathname === '/v1/perps/orders') {
        return url.searchParams.has('cursor')
          ? { result: [orderFixture({ orderId: 'order-2' })] }
          : {
              result: [orderFixture()],
              pageInfo: { nextCursor: 'regular-next' },
            }
      }
      return { result: [twapFixture(), twapFixture({ twapId: 'twap-2' })] }
    })
    const first = await provider.getOrders({ address: ADDRESS, limit: 2 })
    expect(first.orders.map((order) => order.orderId)).toEqual([
      'order-1',
      'twap-1',
    ])
    const second = await provider.getOrders({
      address: ADDRESS,
      limit: 2,
      cursor: first.pagination.cursor,
    })
    expect(second.orders.map((order) => order.orderId)).toEqual([
      'order-2',
      'twap-2',
    ])
    expect(second.pagination.hasMore).toBe(false)
    const regular = requests.filter(
      ({ url }) => url.pathname === '/v1/perps/orders'
    )
    expect(regular[1]?.url.searchParams.get('cursor')).toBe('regular-next')
    expect(
      requests
        .filter(({ url }) => url.pathname.includes('/twap/'))
        .every(({ url }) => !url.searchParams.has('cursor'))
    ).toBe(true)
  })
  it('preserves the unconsumed running TWAP snapshot when an earlier order completes', async () => {
    let runningReads = 0
    const { provider, requests } = await setup((url) => {
      if (url.pathname === '/v1/perps/orders') {
        return { result: [] }
      }
      runningReads++
      return {
        result:
          runningReads === 1
            ? [twapFixture({ twapId: 'A' }), twapFixture({ twapId: 'B' })]
            : [twapFixture({ twapId: 'B' })],
      }
    })
    const first = await provider.getOrders({ address: ADDRESS, limit: 1 })
    expect(first.orders.map((order) => order.orderId)).toEqual(['A'])
    expect(first.pagination.hasMore).toBe(true)
    const second = await provider.getOrders({
      address: ADDRESS,
      limit: 1,
      cursor: first.pagination.cursor,
    })
    expect(second.orders.map((order) => order.orderId)).toEqual(['B'])
    expect(second.pagination.hasMore).toBe(false)
    expect(
      requests.filter(
        ({ url }) => url.pathname === '/v1/perps/twap/orders/running'
      )
    ).toHaveLength(1)
  })
  it('preserves independent history cursors and skips an exhausted regular source', async () => {
    const { provider, requests } = await setup((url) => {
      if (url.pathname === '/v1/perps/orders') {
        return { result: [orderFixture({ status: 'fullyfilled' })] }
      }
      return url.searchParams.has('cursor')
        ? {
            result: [
              twapFixture({ twapId: 'twap-2', orderStatus: 'completed' }),
            ],
          }
        : {
            result: [twapFixture({ orderStatus: 'completed' })],
            pageInfo: { nextCursor: 'twap-next' },
          }
    })
    const first = await provider.getOrders({
      address: ADDRESS,
      statuses: [OrderStatus.FILLED],
      limit: 2,
    })
    const second = await provider.getOrders({
      address: ADDRESS,
      statuses: [OrderStatus.FILLED],
      limit: 2,
      cursor: first.pagination.cursor,
    })
    expect(second.orders.map((order) => order.orderId)).toEqual(['twap-2'])
    expect(
      requests.filter(({ url }) => url.pathname === '/v1/perps/orders')
    ).toHaveLength(1)
    expect(requests.at(-1)?.url.searchParams.get('cursor')).toBe('twap-next')
  })
  it('returns empty null feeds and makes no requests for an empty filter or absent session', async () => {
    const { provider, requests } = await setup(() => ({ result: null }))
    expect((await provider.getOrders({ address: ADDRESS })).orders).toEqual([])
    requests.length = 0
    expect(
      (await provider.getOrders({ address: ADDRESS, statuses: [] })).orders
    ).toEqual([])
    expect(requests).toEqual([])
    const loggedOut = await setup(() => {
      throw new Error('Unexpected request')
    }, false)
    expect(
      (await loggedOut.provider.getOrders({ address: ADDRESS })).orders
    ).toEqual([])
  })
  it('rejects malformed cursors before an authenticated order request', async () => {
    const { provider, requests } = await setup(() => ({ result: [] }))
    await expect(
      provider.getOrders({ address: ADDRESS, cursor: 'invalid' })
    ).rejects.toThrow(PerpsError)
    expect(requests).toEqual([])
  })
  it('keeps the source page size when a later request changes the result limit', async () => {
    const { provider, requests } = await setup((url) => {
      if (url.pathname === '/v1/perps/orders') {
        return {
          result: [orderFixture()],
        }
      }
      if (url.pathname === '/v1/perps/twap/orders/running') {
        return { result: [] }
      }
      return {
        result: [
          twapFixture({ orderStatus: 'completed' }),
          twapFixture({ twapId: 'twap-2', orderStatus: 'completed' }),
        ].slice(0, Number(url.searchParams.get('limit'))),
      }
    })
    const statuses = [OrderStatus.OPEN, OrderStatus.FILLED]
    const first = await provider.getOrders({
      address: ADDRESS,
      statuses,
      limit: 2,
    })
    const second = await provider.getOrders({
      address: ADDRESS,
      statuses,
      limit: 1,
      cursor: first.pagination.cursor,
    })
    expect(second.orders.map((order) => order.orderId)).toEqual(['twap-2'])
    expect(requests.at(-1)?.url.searchParams.get('limit')).toBe('2')
    expect(second.pagination.hasMore).toBe(false)
  })
  it('returns the same union from single regular and TWAP reads', async () => {
    const { provider, requests } = await setup((url) => {
      if (url.pathname === '/v1/perps/orders/client%3Aclient-1') {
        return { result: orderFixture({ clientOrderId: 'client-1' }) }
      }
      if (url.pathname === '/v1/perps/orders/twap-1') {
        return Response.json(
          {
            success: false,
            error: 'Order not found',
            error_code: 'order_not_found',
          },
          { status: 400 }
        )
      }
      if (url.pathname === '/v1/perps/twap/order/twap-1') {
        return { result: twapFixture() }
      }
      throw new Error(`Unexpected path ${url.pathname}`)
    })
    expect(
      await provider.getOrder({ address: ADDRESS, id: 'client:client-1' })
    ).toMatchObject({
      orderId: 'order-1',
      clientOrderId: 'client-1',
      type: OrderType.LIMIT,
    })
    expect(
      await provider.getOrder({ address: ADDRESS, id: 'twap-1' })
    ).toMatchObject({
      orderId: 'twap-1',
      type: OrderType.TWAP,
      status: OrderStatus.PARTIALLY_FILLED,
    })
    expect(requests.map(({ url }) => url.pathname)).toEqual([
      '/v1/perps/orders/client%3Aclient-1',
      '/v1/perps/orders/twap-1',
      '/v1/perps/twap/order/twap-1',
    ])
  })
  it('does not try the TWAP endpoint for an unrelated regular read error', async () => {
    const { provider, requests } = await setup(() =>
      Response.json(
        {
          success: false,
          error: 'Invalid order',
          error_code: 'bad_query_param',
        },
        { status: 400 }
      )
    )
    await expect(
      provider.getOrder({ address: ADDRESS, id: 'order-1' })
    ).rejects.toThrow(PerpsError)
    expect(requests.map(({ url }) => url.pathname)).toEqual([
      '/v1/perps/orders/order-1',
    ])
  })
})
