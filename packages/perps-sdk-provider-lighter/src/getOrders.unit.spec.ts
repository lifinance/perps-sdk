import {
  createPerpsClient,
  type ProviderGetOrdersParams,
} from '@lifi/perps-sdk'
import {
  type Market,
  OrderStatus,
  OrderType,
  PerpsErrorCode,
  PositionMarginAdjustment,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { lighterProvider } from './LighterProvider.js'
import type { LtOrder } from './types/order.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const MARKET: Market = {
  providerId: 'lighter',
  id: '1',
  categoryId: 'lighter',
  baseAsset: {
    providerId: 'lighter',
    id: '1',
    displaySymbol: 'ETH',
    logoURI: '',
    displayName: 'Ether',
    decimals: 18,
  },
  quoteAsset: {
    providerId: 'lighter',
    id: '3',
    displaySymbol: 'USDC',
    logoURI: '',
    displayName: 'USD Coin',
    decimals: 6,
  },
  szDecimals: 4,
  priceDecimals: 2,
  maxLeverage: 20,
  onlyIsolated: false,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
}

const order = (overrides: Partial<LtOrder> = {}): LtOrder => ({
  order_index: 88,
  client_order_index: 0,
  order_id: 'lt-88',
  client_order_id: '0',
  market_index: 1,
  owner_account_index: 42,
  initial_base_amount: '0.5',
  price: '0',
  nonce: 10,
  remaining_base_amount: '0.3',
  is_ask: false,
  filled_base_amount: '0.2',
  filled_quote_amount: '700',
  side: 'buy',
  type: 'twap',
  time_in_force: 'good-till-time',
  reduce_only: false,
  trigger_price: '0',
  order_expiry: 1_775_000_900_000,
  status: 'open',
  trigger_status: 'na',
  trigger_time: 0,
  parent_order_index: 0,
  parent_order_id: '',
  to_trigger_order_id_0: '',
  to_trigger_order_id_1: '',
  to_cancel_order_id_0: '',
  block_height: 1,
  timestamp: 1_775_000_000,
  created_at: 1_775_000_000,
  updated_at: 1_775_000_100,
  transaction_time: 1_775_000_000_000_000,
  ...overrides,
})

function setup(
  active: LtOrder[] | null,
  inactive: LtOrder[] | null = [],
  nextCursor = '',
  markets: Market[] = [MARKET]
) {
  const requests: { url: URL; init?: RequestInit }[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    requests.push({ url, init })
    if (url.pathname.endsWith('/markets')) {
      return Response.json({ markets })
    }
    if (url.pathname === '/api/v1/account') {
      return Response.json({
        code: 200,
        accounts: [{ index: 42, positions: [] }],
      })
    }
    if (url.pathname === '/api/v1/accountActiveOrders') {
      return Response.json({ code: 0, orders: active })
    }
    if (url.pathname === '/api/v1/accountInactiveOrders') {
      return Response.json({
        code: 0,
        orders: inactive,
        next_cursor: nextCursor,
      })
    }
    if (url.pathname === '/api/v1/accountOrders') {
      return Response.json({ code: 0, orders: inactive })
    }
    throw new Error(`Unhandled URL: ${url}`)
  }
  const client = createPerpsClient({
    integrator: 'order-test',
    apiKey: 'test-key',
    retry: false,
    fetch: fetchImpl,
    providers: [
      lighterProvider({
        restUrl: 'https://lighter.test',
        authToken: 'read-token',
      }),
    ],
  })
  const provider = client.getProvider('lighter')
  if (provider === undefined) {
    throw new Error('Lighter provider was not registered')
  }
  return { provider, requests }
}

describe('Lighter getOrders lifecycle reads', () => {
  it('returns running TWAP parents and regular children from the active endpoint', async () => {
    const { provider, requests } = setup([
      order(),
      order({
        order_index: 90,
        filled_base_amount: '0',
        filled_quote_amount: '0',
      }),
      order({ type: 'twap-sub', order_index: 89, parent_order_id: '88' }),
    ])
    const result = await provider.getOrders({ address: ADDRESS, marketId: '1' })
    expect(result.orders).toMatchObject([
      {
        orderId: '88',
        type: OrderType.TWAP,
        status: OrderStatus.PARTIALLY_FILLED,
        averagePrice: '3500',
        durationSeconds: 900,
      },
      { orderId: '90', type: OrderType.TWAP, status: OrderStatus.OPEN },
      { orderId: '89', type: OrderType.LIMIT, parentOrderId: '88' },
    ])
    expect(result.orders[1]).not.toHaveProperty('averagePrice')
    const activeRequest = requests.find(
      ({ url }) => url.pathname === '/api/v1/accountActiveOrders'
    )
    expect(activeRequest?.url.searchParams.get('market_id')).toBe('1')
    expect(new Headers(activeRequest?.init?.headers).get('Authorization')).toBe(
      'read-token'
    )
    expect(
      requests.some(
        ({ url }) => url.pathname === '/api/v1/accountInactiveOrders'
      )
    ).toBe(false)
  })

  it('reads terminal TWAPs and expired orders from history and preserves pagination', async () => {
    const { provider, requests } = setup(
      [],
      [
        order({ status: 'filled' }),
        order({ type: 'limit', order_index: 91, status: 'canceled-expired' }),
        order({ order_index: 92, status: 'canceled' }),
      ],
      'next-page'
    )
    const result = await provider.getOrders({
      address: ADDRESS,
      statuses: [OrderStatus.FILLED, OrderStatus.EXPIRED],
      limit: 10,
      cursor: 'page-one',
    })
    expect(
      result.orders.map(({ orderId, status }) => [orderId, status])
    ).toEqual([
      ['88', OrderStatus.FILLED],
      ['91', OrderStatus.EXPIRED],
    ])
    expect(result.orders[0].type).toBe(OrderType.TWAP)
    expect(result.pagination).toEqual({
      limit: 10,
      cursor: 'next-page',
      hasMore: true,
    })
    const history = requests.find(
      ({ url }) => url.pathname === '/api/v1/accountInactiveOrders'
    )
    expect(history?.url.searchParams.get('limit')).toBe('10')
    expect(history?.url.searchParams.get('cursor')).toBe('page-one')
    expect(
      requests.some(({ url }) => url.pathname === '/api/v1/accountActiveOrders')
    ).toBe(false)
  })

  it('combines active and terminal filters without retaining unrequested statuses', async () => {
    const { provider, requests } = setup(
      [order(), order({ order_index: 89, filled_base_amount: '0' })],
      [order({ order_index: 90, status: 'filled' })]
    )
    const result = await provider.getOrders({
      address: ADDRESS,
      statuses: [OrderStatus.PARTIALLY_FILLED, OrderStatus.FILLED],
    })
    expect(result.orders.map(({ orderId }) => orderId)).toEqual(['88', '90'])
    expect(
      requests.filter(({ url }) =>
        /account(Active|Inactive)Orders$/.test(url.pathname)
      )
    ).toHaveLength(2)
  })

  it('does not repeat the active snapshot on a mixed history continuation page', async () => {
    const { provider, requests } = setup(
      [order()],
      [order({ order_index: 90, status: 'filled' })]
    )
    const result = await provider.getOrders({
      address: ADDRESS,
      statuses: [OrderStatus.PARTIALLY_FILLED, OrderStatus.FILLED],
      cursor: 'history-page-2',
    })
    expect(result.orders.map(({ orderId }) => orderId)).toEqual(['90'])
    expect(
      requests.some(({ url }) => url.pathname === '/api/v1/accountActiveOrders')
    ).toBe(false)
    const history = requests.find(
      ({ url }) => url.pathname === '/api/v1/accountInactiveOrders'
    )
    expect(history?.url.searchParams.get('cursor')).toBe('history-page-2')
  })

  it('preserves the history cursor when the status filter removes the entire page', async () => {
    const { provider } = setup([], [order({ status: 'filled' })], 'continue')
    const result = await provider.getOrders({
      address: ADDRESS,
      statuses: [OrderStatus.CANCELLED],
    })
    expect(result.orders).toEqual([])
    expect(result.pagination).toMatchObject({
      cursor: 'continue',
      hasMore: true,
    })
  })

  it.each([
    undefined,
    [OrderStatus.FILLED],
  ])('accepts null venue lists with statuses %s', async (statuses) => {
    const { provider } = setup(null, null)
    expect(
      (await provider.getOrders({ address: ADDRESS, statuses })).orders
    ).toEqual([])
  })

  it('does not request an endpoint for an empty status filter', async () => {
    const { provider, requests } = setup([])
    const result = await provider.getOrders({ address: ADDRESS, statuses: [] })
    expect(result.orders).toEqual([])
    expect(requests).toEqual([])
  })

  it('drops a history row whose market the registry cannot resolve', async () => {
    const { provider } = setup(
      [],
      [
        order({ status: 'filled' }),
        order({ order_index: 91, market_index: 999, status: 'filled' }),
      ]
    )
    const result = await provider.getOrders({
      address: ADDRESS,
      statuses: [OrderStatus.FILLED],
    })
    expect(result.orders.map(({ orderId }) => orderId)).toEqual(['88'])
  })

  it('keeps a history row whose market is delisted', async () => {
    const { provider } = setup(
      [],
      [order({ order_index: 91, market_index: 2, status: 'filled' })],
      '',
      [MARKET, { ...MARKET, id: '2', isDelisted: true }]
    )
    const result = await provider.getOrders({
      address: ADDRESS,
      statuses: [OrderStatus.FILLED],
    })
    expect(result.orders.map(({ orderId }) => orderId)).toEqual(['91'])
  })

  it('rejects a market id that the registry does not contain', async () => {
    const { provider } = setup([])
    await expect(
      provider.getOrders({ address: ADDRESS, marketId: 'LIT/USDC' })
    ).rejects.toMatchObject({
      code: PerpsErrorCode.MarketNotFound,
      tool: 'lighter',
    })
  })

  it('uses the same order shape for list reads and single-order reads', async () => {
    const { provider } = setup(
      [],
      [order({ status: 'filled', client_order_index: 7 })]
    )
    const params: ProviderGetOrdersParams = {
      address: ADDRESS,
      statuses: [OrderStatus.FILLED],
    }
    const result = await provider.getOrders(params)
    const single = await provider.getOrder({ address: ADDRESS, id: '88' })
    expect(single).toEqual(result.orders[0])
  })
})
